import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const migrationDir = fileURLToPath(
  new URL("../../supabase/migrations/", import.meta.url),
);

async function freePort() {
  const server = createServer();
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  const port = server.address().port;
  await new Promise((ok, fail) =>
    server.close((error) => (error ? fail(error) : ok())),
  );
  return port;
}

export async function withPostgres(run) {
  const bin = process.env.POSTGRES_BIN || "C:/Program Files/PostgreSQL/18/bin";
  const port = await freePort();
  const root = await mkdtemp(join(tmpdir(), "fridgefirst-pg-"));
  const data = join(root, "data");
  const command = (name, args) =>
    exec(
      join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`),
      args,
      { windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 },
    );
  const connectionArgs = [
    "-X",
    "--no-password",
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "postgres",
    "-d",
    "postgres",
  ];
  const sql = async (statement) => {
    const { stdout } = await command("psql", [
      ...connectionArgs,
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "VERBOSITY=verbose",
      "-Atq",
      "-c",
      statement,
    ]);
    return stdout.trim();
  };
  let startAttempted = false;
  try {
    await command("initdb", [
      "-D",
      data,
      "-U",
      "postgres",
      "-A",
      "trust",
      "--no-locale",
      "-E",
      "UTF8",
    ]);
    startAttempted = true;
    await command("pg_ctl", [
      "-D",
      data,
      "-l",
      join(root, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p ${port}`,
      "-w",
      "start",
    ]);
    await sql(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,owner_id text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
      grant usage on schema storage to authenticated,anon;
      grant select,insert,update,delete on storage.objects to authenticated;
      grant execute on function storage.foldername(text) to authenticated;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
    `);
    for (const name of (await readdir(migrationDir))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      await sql(await readFile(join(migrationDir, name), "utf8"));
    }
    // Hosted postgres cannot grant auth schema access to custom roles.
    await sql(
      "revoke usage on schema auth from pantry_writer, pantry_executor",
    );
    return await run({ sql, connectionArgs, command, root, port });
  } finally {
    if (startAttempted) {
      const running = await command("pg_ctl", ["-D", data, "status"]).then(
        () => true,
        (error) => {
          if (error.code === 3) return false;
          throw error;
        },
      );
      if (running)
        await command("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    }
    const target = resolve(root);
    if (
      !target.startsWith(resolve(tmpdir()) + sep) ||
      !target.includes("fridgefirst-pg-")
    ) {
      throw new Error(`Refusing cleanup outside disposable cluster: ${target}`);
    }
    await rm(target, { recursive: true, force: true });
  }
}
