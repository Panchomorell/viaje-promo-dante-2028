const OWNER = process.env.GITHUB_OWNER || "Panchomorell";
const REPO = process.env.GITHUB_REPO || "viaje-promo-dante-2028";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const FILE_PATH = process.env.RESPONSES_FILE_PATH || "public/data/responses.json";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "DA2028";

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function decodeContent(content) {
  return Buffer.from(content || "", "base64").toString("utf8");
}

async function readGithubFile() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    throw new Error(`GitHub read failed: ${response.status}`);
  }
  const payload = await response.json();
  return {
    sha: payload.sha,
    rows: JSON.parse(decodeContent(payload.content))
  };
}

async function writeGithubFile(rows) {
  const current = await readGithubFile();
  const content = Buffer.from(`${JSON.stringify(rows, null, 2)}\n`, "utf8").toString("base64");
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(),
    body: JSON.stringify({
      branch: BRANCH,
      message: `Update response data (${new Date().toISOString()})`,
      content,
      sha: current.sha
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub write failed: ${response.status} ${details}`);
  }
}

function getBody(req) {
  if (typeof req.body === "string") return JSON.parse(req.body);
  return req.body || {};
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!process.env.GITHUB_TOKEN) {
    return res.status(503).json({
      error: "cloud_updates_not_configured",
      message: "Missing GITHUB_TOKEN environment variable."
    });
  }

  try {
    if (req.method === "GET") {
      const { rows } = await readGithubFile();
      return res.status(200).json({ rows });
    }

    if (req.method === "POST") {
      const body = getBody(req);
      if (body.password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "invalid_password" });
      }
      if (!Array.isArray(body.rows)) {
        return res.status(400).json({ error: "rows_must_be_array" });
      }

      await writeGithubFile(body.rows);
      return res.status(200).json({ ok: true, rows: body.rows });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "responses_api_failed", message: error.message });
  }
}
