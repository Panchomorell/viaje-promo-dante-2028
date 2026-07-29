export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const url = new URL(request.url);

    if (
      response.status === 404 &&
      request.method === "GET" &&
      !url.pathname.startsWith("/api/")
    ) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }

    return response;
  }
};
