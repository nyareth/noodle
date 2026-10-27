const bool = (v: string | undefined, d: boolean) =>
  v === undefined || v.trim() === "" ? d : ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
const int = (v: string | undefined, d: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : d;
};
const list = (v: string | undefined) =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export type AnswerNumbering = "abc" | "ABCD" | "123" | "none";

/** Runtime configuration. Getters so values are read when used, not at build time. */
export const env = {
  get databaseUrl() { return process.env.DATABASE_URL ?? "postgres://quiz:quiz@localhost:5432/quiz"; },
  get siteName() { return process.env.SITE_NAME || "Campus Quiz Practice"; },
  get timezone() { return process.env.APP_TIMEZONE || "Asia/Kuala_Lumpur"; },
  get answerNumbering(): AnswerNumbering {
    const v = process.env.ANSWER_NUMBERING;
    return v === "ABCD" || v === "123" || v === "none" ? v : "abc";
  },
  get allowRegistration() { return bool(process.env.ALLOW_REGISTRATION, true); },
  get allowedEmailDomains() { return list(process.env.ALLOWED_EMAIL_DOMAIN).map((d) => d.toLowerCase().replace(/^@/, "")); },
  get sessionDays() { return int(process.env.SESSION_DAYS, 14); },
  get bcryptCost() { return int(process.env.BCRYPT_COST, 12); },
  get cookieSecure(): boolean | undefined {
    const v = process.env.COOKIE_SECURE;
    return v === undefined || v.trim() === "" ? undefined : bool(v, false);
  },
  get trustedOrigins() { return list(process.env.TRUSTED_ORIGINS); },
  get maxQuestionsPerAttempt() { return int(process.env.MAX_QUESTIONS_PER_ATTEMPT, 100); },
  get deadlineGraceSeconds() { return int(process.env.DEADLINE_GRACE_SECONDS, 10); },
  get maxImageBytes() { return int(process.env.MAX_IMAGE_BYTES, 5 * 1024 * 1024); },
  get storageDriver() { return process.env.STORAGE_DRIVER === "s3" ? "s3" : "local"; },
  get localUploadDir() { return process.env.LOCAL_UPLOAD_DIR || "./uploads"; },
  get s3() {
    return {
      bucket: process.env.S3_BUCKET ?? "",
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      forcePathStyle: bool(process.env.S3_FORCE_PATH_STYLE, false),
    };
  },
};
