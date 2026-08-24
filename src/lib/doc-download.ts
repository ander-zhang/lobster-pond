import { getDocAsset } from "./content.ts";
import { exportDoc } from "./doc-export.ts";
import type { MarkdownDoc } from "./types.ts";

// 下载文件解析：有上传附件返回附件原文（base64），无附件用 exportDoc 实时生成
// （知识 .md / 技能 .zip 安装包）。动态 GET 与静态 POST 下载路由共用，避免两处逻辑漂移。
export type DocDownloadFile = {
  filename: string;
  contentType: string;
  contentBase64: string;
  sizeBytes: number;
};

export async function resolveDocDownloadFile(doc: MarkdownDoc): Promise<DocDownloadFile> {
  const asset = await getDocAsset(doc.id);
  if (asset) {
    return {
      filename: asset.filename,
      contentType: asset.contentType,
      contentBase64: asset.contentBase64,
      sizeBytes: asset.sizeBytes,
    };
  }
  const exported = exportDoc(doc);
  return {
    filename: exported.filename,
    contentType: exported.contentType,
    contentBase64: Buffer.from(exported.body).toString("base64"),
    sizeBytes: exported.body.length,
  };
}
