import "server-only";

import { MongoClient, Db } from "mongodb";

const MONGODB_DB = process.env.MONGODB_DB || "prepwise";

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise__: Promise<MongoClient> | undefined;
}

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI in environment");
  }

  const clientPromise =
    global.__mongoClientPromise__ || new MongoClient(uri).connect();

  if (process.env.NODE_ENV !== "production") {
    global.__mongoClientPromise__ = clientPromise;
  }

  const client = await clientPromise;
  return client.db(MONGODB_DB);
}
