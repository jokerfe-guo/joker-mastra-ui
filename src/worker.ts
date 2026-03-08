export interface Env {
  AGENT_STREAM_URL: string;
  ASSETS: Fetcher;
}

function withCors(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("access-control-allow-origin", "*");
  nextHeaders.set("access-control-allow-methods", "POST, OPTIONS");
  nextHeaders.set("access-control-allow-headers", "content-type");
  return nextHeaders;
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: withCors({
      "content-type": "application/json; charset=utf-8",
      ...init?.headers
    })
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: withCors()
      });
    }

    if (url.pathname === "/api/stream") {
      if (request.method !== "POST") {
        return json(
          {
            error: "Method Not Allowed"
          },
          {
            status: 405
          }
        );
      }

      try {
        const upstreamResponse = await fetch(env.AGENT_STREAM_URL, {
          method: "POST",
          headers: {
            "content-type":
              request.headers.get("content-type") ?? "application/json",
            accept: "text/event-stream"
          },
          body: request.body
        });

        return new Response(upstreamResponse.body, {
          status: upstreamResponse.status,
          headers: withCors(upstreamResponse.headers)
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Upstream request failed";

        return json(
          {
            error: message
          },
          {
            status: 502
          }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
