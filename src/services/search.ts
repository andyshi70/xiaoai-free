import { Logger } from "../utils/log";

/**
 * 联网搜索，按 Tavily → Firecrawl → 豆包搜索 的顺序降级。
 * 任一搜索源没配 Key 会跳过；请求失败、额度用尽、无结果都会自动换下一个。
 */
const kTavilyAPI = "https://api.tavily.com/search";
const kFirecrawlAPI = "https://api.firecrawl.dev/v1/search";
const kDoubaoGlobalAPI =
  "https://open.feedcoopapi.com/search_api/global_search";
const kDoubaoCustomAPI =
  "https://open.feedcoopapi.com/search_api/web_search";

// 触发联网搜索的关键词，可用环境变量 SEARCH_KEYWORDS（或旧的 DOUBAO_SEARCH_KEYWORDS）覆盖
const kDefaultKeywords =
  "天气,新闻,最新,热搜,股价,汇率,比分,实时,联网,搜索,搜一下,查一下,查下,多少钱,几点";

export interface SearchDoc {
  title: string;
  url: string;
  publishTime: string;
  text: string;
}

const logger = Logger.create({ tag: "Search" });

async function postJson(url: string, apiKey: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  }).catch((e) => {
    throw new Error(`网络错误: ${e?.message ?? e}`);
  });
  const text = await res.text();
  if (!res.ok) {
    // 429/432 通常是额度用尽，抛出去交给下一个搜索源
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

async function tavilySearch(query: string, count: number, apiKey: string) {
  const data = await postJson(kTavilyAPI, apiKey, {
    query,
    search_depth: "basic",
    max_results: count,
    include_answer: false,
  });
  return (data?.results ?? []).slice(0, count).map((e: any) => ({
    title: e.title ?? "",
    url: e.url ?? "",
    publishTime: e.published_date ?? "",
    text: String(e.content ?? "").slice(0, 400),
  }));
}

async function firecrawlSearch(query: string, count: number, apiKey: string) {
  const data = await postJson(kFirecrawlAPI, apiKey, { query, limit: count });
  if (data?.success === false) {
    throw new Error(String(data?.error ?? "返回 success=false").slice(0, 200));
  }
  return (data?.data ?? []).slice(0, count).map((e: any) => ({
    title: e.title ?? "",
    url: e.url ?? "",
    publishTime: e.published_date ?? "",
    text: String(e.description ?? e.markdown ?? "").slice(0, 400),
  }));
}

async function doubaoSearch(query: string, count: number, apiKey: string) {
  const custom = process.env.DOUBAO_SEARCH_VERSION === "custom";
  const data = await postJson(
    custom ? kDoubaoCustomAPI : kDoubaoGlobalAPI,
    apiKey,
    custom
      ? { Query: query, SearchType: "web", Count: count }
      : { query, doc_count: count, max_snippet_length: 400 }
  );
  const error = data?.ResponseMetadata?.Error;
  if (error) {
    throw new Error(String(error.Message ?? error.Code ?? "返回异常"));
  }
  // global 版服务端暂不支持 doc_count，固定返回 10 条，这里统一截断
  if (custom) {
    return (data?.Result?.WebResults ?? []).slice(0, count).map((e: any) => ({
      title: e.Title ?? "",
      url: e.Url ?? "",
      publishTime: e.PublishTime ?? "",
      text: String(e.Content ?? e.Summary ?? "").slice(0, 400),
    }));
  }
  return (data?.Result?.Documents ?? []).slice(0, count).map((e: any) => ({
    title: e.Title ?? "",
    url: e.Url ?? "",
    publishTime: e.DocumentInfo?.PublishTime ?? "",
    text: (e.Snippet ?? [])
      .filter((s: any) => s.Type === "text")
      .map((s: any) => String(s.Text ?? "").trim())
      .join("\n")
      .slice(0, 400),
  }));
}

const kProviders = [
  { name: "Tavily", env: "TAVILY_API_KEY", search: tavilySearch },
  { name: "Firecrawl", env: "FIRECRAWL_API_KEY", search: firecrawlSearch },
  { name: "豆包搜索", env: "DOUBAO_SEARCH_API_KEY", search: doubaoSearch },
];

export function needSearch(text: string) {
  if (!kProviders.some((p) => process.env[p.env])) return false;
  const keywords = (
    process.env.SEARCH_KEYWORDS ??
    process.env.DOUBAO_SEARCH_KEYWORDS ??
    kDefaultKeywords
  )
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  return keywords.some((keyword) => text.includes(keyword));
}

export async function webSearch(query: string, count = 5) {
  for (const provider of kProviders) {
    const apiKey = process.env[provider.env];
    if (!apiKey) continue;
    try {
      const docs = await provider.search(query, count, apiKey);
      if (docs.length > 0) {
        logger.log(`🔎 ${provider.name} 命中 ${docs.length} 条`);
        return docs as SearchDoc[];
      }
      logger.log(`🔎 ${provider.name} 无结果，换下一个搜索源`);
    } catch (e: any) {
      logger.error(`${provider.name} 搜索失败，换下一个搜索源: ${e?.message}`);
    }
  }
  return [] as SearchDoc[];
}

export function formatSearchDocs(docs: SearchDoc[]) {
  return docs
    .map((doc, index) => {
      const time = doc.publishTime ? `（${doc.publishTime}）` : "";
      return `[${index + 1}] ${doc.title}${time}\n${doc.text}`;
    })
    .join("\n\n");
}
