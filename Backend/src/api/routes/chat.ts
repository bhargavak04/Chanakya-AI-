import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { runChatPipeline } from "../../lib/chat/pipeline.js";
import {
  createConversation,
  getConversation,
  getLatestState,
  addTurn,
} from "../../lib/memory/conversation.js";

const chatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  dbId: z.string().uuid(),
  message: z.string().min(1),
  mode: z.enum(["analyze", "forecast", "simulate", "diagnose", "max"]).default("analyze"),
});

export const chatRoutes: FastifyPluginAsync = async (app) => {
  app.post("/chat", async (req, reply) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { conversationId: maybeConvId, dbId, message, mode } = parsed.data;

    let conversationId = maybeConvId;
    if (!conversationId) {
      conversationId = createConversation(dbId);
    } else {
      const conv = getConversation(conversationId);
      if (!conv) return reply.status(404).send({ error: "Conversation not found" });
      if (conv.active_db_id !== dbId) {
        return reply.status(400).send({ error: "Conversation is tied to a different database" });
      }
    }

    const state = getLatestState(conversationId);

    const response = await runChatPipeline({
      conversationId,
      dbId,
      message,
      mode,
      conversationState: state,
    });

    addTurn(conversationId, "user", message);

    if ("error" in response) {
      addTurn(conversationId, "assistant", JSON.stringify(response));
      return reply.status(400).send({ ...response, conversationId });
    }

    addTurn(conversationId, "assistant", JSON.stringify(response), {
      db_id: dbId,
      filters: {},
      last_query: response.meta.sql,
      last_chart_config: response.chart_config,
      last_metric: response.chart_config.y_axis[0],
    });

    return { ...response, conversationId };
  });
};
