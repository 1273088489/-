// 种子脚本：初始化数据库 schema 并导入课程。
// 用法: npm run db:seed
import { seedCurriculum } from "../src/server/curriculum/service";

async function main() {
  const result = await seedCurriculum();
  console.log("Seed complete:", JSON.stringify(result));
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
