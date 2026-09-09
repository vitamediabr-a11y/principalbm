import "dotenv/config";
import { z } from "zod";
import { bootstrapFirstOwner } from "../src/services/bootstrap-owner";
import { prisma } from "../src/lib/prisma";

const cliEnvSchema = z.object({
  BOOTSTRAP_CONFIRM: z.literal("CREATE_FIRST_OWNER"),
  BOOTSTRAP_OWNER_EMAIL: z.string().email(),
  BOOTSTRAP_OWNER_NAME: z.string().min(2),
  BOOTSTRAP_OWNER_PASSWORD: z.string().min(12),
  BOOTSTRAP_ORGANIZATION_NAME: z.string().min(2),
});

async function main() {
  const input = cliEnvSchema.parse(process.env);
  const result = await bootstrapFirstOwner({
    email: input.BOOTSTRAP_OWNER_EMAIL,
    name: input.BOOTSTRAP_OWNER_NAME,
    password: input.BOOTSTRAP_OWNER_PASSWORD,
    organizationName: input.BOOTSTRAP_ORGANIZATION_NAME,
  });

  if (result.status === "already_bootstrapped") {
    console.log("O primeiro proprietário já estava configurado com os mesmos dados. Nenhuma alteração foi feita.");
  } else {
    console.log("Primeiro proprietário e organização criados com sucesso.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Falha no bootstrap inicial.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
