import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.botState.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      capitalUsd: 200,
      capitalSol: 2.2,
      walletBalance: 2.2,
      dailyLossLimit: 10,
      weeklyLossLimit: 20,
      capitalLevel: "NORMAL",
      regime: "NORMAL",
      rollingWinRate: 0.5,
      isRunning: false,
    },
  });

  await prisma.configProfile.upsert({
    where: { name: "default" },
    update: {
      description: "Baseline default dry-run profile",
      mode: "DRY_RUN",
      isActive: true,
      settings: {},
    },
    create: {
      name: "default",
      description: "Baseline default dry-run profile",
      mode: "DRY_RUN",
      isActive: true,
      settings: {},
    },
  });

  await prisma.apiUsageDaily.createMany({
    data: [
      {
        date: new Date(),
        service: "HELIUS",
        budgetTotal: 10_000_000,
        totalCalls: 0,
        totalCredits: 0,
      },
      {
        date: new Date(),
        service: "BIRDEYE",
        budgetTotal: 1_500_000,
        totalCalls: 0,
        totalCredits: 0,
      },
    ],
    skipDuplicates: true,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
