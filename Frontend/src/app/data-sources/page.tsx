"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Database, RefreshCw, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";

export default function DataSourcesPage() {
  const { databases, loadDatabases, activeDbId, setActiveDbIdAndClearChat } = useApp();
  const [adding, setAdding] = useState(false);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "postgresql" as "postgresql" | "mysql",
    host: "localhost",
    port: 5432,
    database: "",
    username: "",
    password: "",
    ssl_required: true,
  });

  useEffect(() => {
    loadDatabases();
  }, [loadDatabases]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.database || !form.username || !form.password) return;
    setAdding(true);
    try {
      await api.addDatabase(form);
      await loadDatabases();
      setForm({ ...form, name: "", database: "", username: "", password: "" });
      toast.success("Database added successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add database");
    } finally {
      setAdding(false);
    }
  };

  const handleIngest = async (dbId: string) => {
    setIngesting(dbId);
    try {
      const res = await api.ingestSchema(dbId);
      toast.success(`Schema ingested: ${res.tables} tables, ${res.columns} columns`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Schema ingestion failed");
    } finally {
      setIngesting(null);
    }
  };

  const handleDelete = async (dbId: string) => {
    const db = databases.find((d) => d.id === dbId);
    setDeleteTarget(db ? { id: dbId, name: db.name } : null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteDatabase(deleteTarget.id);
      await loadDatabases();
      toast.success(`"${deleteTarget.name}" removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove database");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto p-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Chat
        </Link>

        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">Data Sources</h1>
          <p className="text-muted-foreground mt-1">
            Add and manage database connections. Ingest schema to enable chat queries.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          {/* Add database form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add Database</CardTitle>
              <CardDescription>
                Connect a PostgreSQL or MySQL database. Credentials are stored securely.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} className="space-y-5">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="Production DB"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v: "postgresql" | "mysql") =>
                      setForm({ ...form, type: v, port: v === "postgresql" ? 5432 : 3306 })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="postgresql">PostgreSQL</SelectItem>
                      <SelectItem value="mysql">MySQL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Host</Label>
                    <Input
                      placeholder="localhost"
                      value={form.host}
                      onChange={(e) => setForm({ ...form, host: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input
                      type="number"
                      value={form.port}
                      onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) || 5432 })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Database</Label>
                  <Input
                    placeholder="mydb"
                    value={form.database}
                    onChange={(e) => setForm({ ...form, database: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    placeholder="user"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>SSL required</Label>
                    <p className="text-[12px] text-muted-foreground">
                      Required for Azure, AWS, and other cloud databases
                    </p>
                  </div>
                  <Switch
                    checked={form.ssl_required}
                    onCheckedChange={(checked) => setForm({ ...form, ssl_required: checked })}
                  />
                </div>
                <Button type="submit" disabled={adding} className="w-full">
                  {adding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Add Database
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Connected databases */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connected</CardTitle>
              <CardDescription>
                {databases.length === 0
                  ? "No databases yet."
                  : `${databases.length} database${databases.length === 1 ? "" : "s"} connected.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {databases.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-border rounded-lg">
                  <Database className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Add a database to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {databases.map((db) => (
                    <div
                      key={db.id}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg border transition-colors",
                        activeDbId === db.id ? "border-primary/50 bg-primary/5" : "border-border hover:bg-secondary/30"
                      )}
                    >
                      <button
                        onClick={() => setActiveDbIdAndClearChat(db.id)}
                        className="flex items-center gap-4 text-left flex-1 min-w-0"
                      >
                        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                          <Database className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{db.name}</p>
                          <p className="text-sm text-muted-foreground capitalize">{db.type}</p>
                        </div>
                        {activeDbId === db.id && (
                          <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </button>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleIngest(db.id)}
                          disabled={ingesting === db.id}
                          title="Ingest schema"
                        >
                          {ingesting === db.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-1.5" />
                              Schema
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                          onClick={() => handleDelete(db.id)}
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove database</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove &quot;{deleteTarget?.name}&quot;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDelete}>
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
