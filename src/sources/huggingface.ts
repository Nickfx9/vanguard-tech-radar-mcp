import axios from "axios";
import { scoreTrend } from "../scoring.js";
import { TrendItem, TrendQuery } from "../types.js";

type HFModel = {
  id: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string;
  tags?: string[];
  lastModified?: string;
};

export async function fetchHuggingFaceModels(query: TrendQuery = {}): Promise<TrendItem[]> {
  const search = query.query?.trim() || "agent";
  const response = await axios.get<HFModel[]>("https://huggingface.co/api/models", {
    params: {
      search,
      sort: "likes",
      direction: -1,
      limit: Math.min(query.limit ?? 10, 30)
    },
    timeout: 15_000
  });

  return response.data.map((model) =>
    scoreTrend({
      title: model.id,
      url: `https://huggingface.co/${model.id}`,
      source: "Hugging Face Models",
      category: "model",
      publishedAt: model.lastModified,
      summary: `Pipeline: ${model.pipeline_tag ?? "unknown"} | likes: ${model.likes ?? 0} | downloads: ${model.downloads ?? 0}`,
      score: Math.min(30, Math.floor((model.likes ?? 0) / 100)) + Math.min(20, Math.floor((model.downloads ?? 0) / 10000)),
      tags: model.tags ?? [],
      metadata: {
        likes: model.likes ?? 0,
        downloads: model.downloads ?? 0,
        pipeline: model.pipeline_tag
      }
    })
  );
}

