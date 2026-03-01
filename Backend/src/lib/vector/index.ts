/**
 * Vector schema retrieval - Cohere embeddings + Qdrant
 * One collection (schema_embeddings), filter by db_id
 */
import { CohereClient } from "cohere-ai";
import { QdrantClient } from "@qdrant/js-client-rest";

const COLLECTION = "schema_embeddings";
const VECTOR_SIZE = 1024;
const EMBED_MODEL = "embed-english-v3.0";
const BATCH_SIZE = 90; // Cohere embed limit

let cohereClient: CohereClient | null = null;
let qdrantClient: QdrantClient | null = null;

export function isVectorEnabled(): boolean {
  return !!(
    process.env.COHERE_API_KEY &&
    process.env.QDRANT_CLUSTER_ENDPOINT
  );
}

function getCohereClient(): CohereClient {
  if (!cohereClient) {
    const key = process.env.COHERE_API_KEY;
    if (!key) throw new Error("COHERE_API_KEY is required");
    cohereClient = new CohereClient({ token: key });
  }
  return cohereClient;
}

function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    const url = process.env.QDRANT_CLUSTER_ENDPOINT;
    if (!url) throw new Error("QDRANT_CLUSTER_ENDPOINT is required");
    qdrantClient = new QdrantClient({
      url,
      apiKey: process.env.QDRANT_API_KEY,
    });
  }
  return qdrantClient;
}

export async function embedTexts(
  texts: string[],
  inputType: "search_document" | "search_query" = "search_document"
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getCohereClient();
  const allVectors: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await client.embed({
      texts: batch,
      model: EMBED_MODEL,
      inputType,
      embeddingTypes: ["float"],
    });

    const embeddings = (res as { embeddings?: { float?: number[][] } }).embeddings?.float;
    if (!embeddings) throw new Error("Cohere embed returned no embeddings");
    allVectors.push(...embeddings);
  }

  return allVectors;
}

export interface SchemaChunk {
  tableId: string;
  tableName: string;
  text: string;
}

export async function ensureCollection(): Promise<void> {
  const client = getQdrantClient();
  const collections = await client.getCollections();
  const exists = collections.collections?.some((c) => c.name === COLLECTION);

  if (!exists) {
    await client.createCollection(COLLECTION, {
      vectors: {
        size: VECTOR_SIZE,
        distance: "Cosine",
      },
    });
  }

  try {
    await client.createPayloadIndex(COLLECTION, {
      field_name: "db_id",
      field_schema: "keyword",
      wait: true,
    });
  } catch (e) {
    if (e instanceof Error && !e.message.toLowerCase().includes("already exists")) {
      throw e;
    }
  }
}

export async function upsertSchemaChunks(
  dbId: string,
  chunks: SchemaChunk[]
): Promise<void> {
  if (chunks.length === 0) return;

  const client = getQdrantClient();
  await ensureCollection();

  const texts = chunks.map((c) => c.text);
  const vectors = await embedTexts(texts, "search_document");

  const points = chunks.map((c, i) => ({
    id: c.tableId,
    vector: vectors[i],
    payload: {
      db_id: dbId,
      table_id: c.tableId,
      table_name: c.tableName,
      chunk_text: c.text,
    },
  }));

  await client.upsert(COLLECTION, {
    points,
    wait: true,
  });
}

export async function deleteSchemaChunksForDb(dbId: string): Promise<void> {
  const client = getQdrantClient();
  try {
    await client.delete(COLLECTION, {
      filter: {
        must: [{ key: "db_id", match: { value: dbId } }],
      },
      wait: true,
    });
  } catch (e) {
    // Collection might not exist yet
    if (
      e instanceof Error &&
      !e.message.includes("Not found") &&
      !e.message.includes("doesn't exist")
    ) {
      throw e;
    }
  }
}

export async function searchSchemaChunks(
  dbId: string,
  queryEmbedding: number[],
  limit = 15
): Promise<{ tableId: string; tableName: string; score: number }[]> {
  const client = getQdrantClient();

  const result = await client.search(COLLECTION, {
    vector: queryEmbedding,
    filter: {
      must: [{ key: "db_id", match: { value: dbId } }],
    },
    limit,
    with_payload: ["table_id", "table_name"],
    with_vector: false,
  });

  return result.map((r) => ({
    tableId: (r.payload?.table_id as string) ?? "",
    tableName: (r.payload?.table_name as string) ?? "",
    score: r.score ?? 0,
  }));
}
