import bcrypt from "bcryptjs";
import { env } from "./env";

export const hashPassword = (pw: string) => bcrypt.hash(pw, env.bcryptCost);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
// Compared against when the e-mail is unknown, so response time does not reveal which e-mails exist.
export const DUMMY_HASH = "$2b$10$jqvdjwdg09WWo8nFroxAPe5JffoSJrP8LNccn./tSV2h3wFk31aqy";
