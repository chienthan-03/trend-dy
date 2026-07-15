const { PrismaClient } = require("../generated/prisma-client");

const main = async () => {
  const prisma = new PrismaClient();

  try {
    const fakeItemIds = (
      await prisma.viralItem.findMany({
        where: { externalId: { startsWith: "fake-" } },
        select: { id: true },
      })
    ).map((item) => item.id);

    const remakes = await prisma.viralRemake.deleteMany({
      where: {
        OR: [
          { externalVideoId: { startsWith: "fake-" } },
          { viralItemId: { in: fakeItemIds } },
        ],
      },
    });

    const items = await prisma.viralItem.deleteMany({
      where: { externalId: { startsWith: "fake-" } },
    });

    const crawlRuns = await prisma.viralCrawlRun.deleteMany({});
    const boards = await prisma.viralBoard.updateMany({
      data: { lastCrawledAt: null },
    });

    console.log(
      JSON.stringify(
        {
          deletedRemakes: remakes.count,
          deletedItems: items.count,
          deletedCrawlRuns: crawlRuns.count,
          boardsReset: boards.count,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
