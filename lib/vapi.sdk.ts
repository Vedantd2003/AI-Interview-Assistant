import Vapi from "@vapi-ai/web";

const normalizeEnvValue = (value?: string) =>
  value?.trim().replace(/^[\s'",]+|[\s'",]+$/g, "");

export const vapiWebToken = normalizeEnvValue(
  process.env.NEXT_PUBLIC_VAPI_WEB_TOKEN
);

export const vapi = new Vapi(vapiWebToken || "");
