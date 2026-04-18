import { promises as fs } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { db } from "../../db/client.js";
import { toJsonValue } from "../../utils/json.js";
import { listCreatedDiscoveryLabPacks } from "../discovery-lab-created-packs.js";
import {
  customPackFileSchema,
  slugify,
  DEFAULT_PROFILE,
  DEFAULT_SOURCES,
  type DiscoveryLabPack,
  type DiscoveryLabPackDraft,
} from "../discovery-lab-pack-types.js";
import { listWorkspaceDiscoveryLabPackSeeds } from "../discovery-lab-workspace-packs.js";
import {
  buildStrategyPackSnapshot,
  isWorkspacePackId,
  mapPackKindForDb,
  writeJsonFileAtomic,
} from "./discovery-lab-shared.js";

export class PackRepo {
  private readonly backendRoot: string;
  private readonly localRoot: string;
  private readonly packsDir: string;

  constructor() {
    this.backendRoot = process.cwd();
    this.localRoot = path.join(this.backendRoot, ".local", "discovery-lab");
    this.packsDir = path.join(this.localRoot, "packs");
  }

  async ensure(): Promise<void> {
    await fs.mkdir(this.packsDir, { recursive: true });
    await this.seedWorkspacePacks();
    await this.syncPacksToDb(await this.listPacks());
  }

  async listPacks(): Promise<DiscoveryLabPack[]> {
    const [created, custom] = await Promise.all([
      Promise.resolve(listCreatedDiscoveryLabPacks()),
      this.listCustomPacks(),
    ]);
    return [...created, ...custom].sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "created" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
  }

  async getPack(packId: string): Promise<DiscoveryLabPack | null> {
    const normalizedPackId = packId.trim();
    if (!normalizedPackId) {
      throw new Error("packId is required");
    }
    const packs = await this.listPacks();
    return packs.find((pack) => pack.id === normalizedPackId) ?? null;
  }

  async savePack(input: DiscoveryLabPackDraft): Promise<DiscoveryLabPack> {
    if (input.id && isWorkspacePackId(input.id)) {
      throw new Error("workspace packs are read-only");
    }
    if (input.id) {
      const existing = await this.getPack(input.id);
      if (existing && existing.kind !== "custom") {
        throw new Error("only custom packs can be updated");
      }
    }

    const id = input.id ?? (await this.allocatePackId(input.name));
    if (isWorkspacePackId(id)) {
      throw new Error("workspace-* ids are reserved");
    }

    const record = {
      id,
      name: input.name,
      description: input.description ?? "",
      thesis: input.thesis ?? null,
      targetPnlBand: input.targetPnlBand ?? null,
      defaultSources: input.defaultSources?.length ? input.defaultSources : DEFAULT_SOURCES,
      defaultProfile: input.defaultProfile ?? DEFAULT_PROFILE,
      thresholdOverrides: input.thresholdOverrides ?? {},
      recipes: input.recipes,
      updatedAt: new Date().toISOString(),
    };
    const filePath = this.packFilePath(id);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await writeJsonFileAtomic(filePath, record);
    const pack = await this.readCustomPack(filePath);
    await this.upsertPackRecord(pack);
    return pack;
  }

  async deletePack(packId: string): Promise<{ ok: true }> {
    const normalizedPackId = packId.trim();
    if (!normalizedPackId) {
      throw new Error("packId is required");
    }
    if (isWorkspacePackId(normalizedPackId)) {
      throw new Error("workspace packs are read-only");
    }
    const existing = await this.getPack(normalizedPackId);
    if (!existing) {
      throw new Error("pack not found");
    }
    if (existing.kind !== "custom") {
      throw new Error("only custom packs can be deleted");
    }

    await fs.rm(this.packFilePath(normalizedPackId), { force: true });
    await db.discoveryLabPack.deleteMany({ where: { id: normalizedPackId } });
    await db.strategyPackVersion.deleteMany({ where: { packId: normalizedPackId } });
    await db.strategyPack.deleteMany({ where: { id: normalizedPackId } });
    return { ok: true };
  }

  private async listCustomPacks(): Promise<DiscoveryLabPack[]> {
    return this.readJsonFiles(
      this.packsDir,
      (entry) => entry.endsWith(".json"),
      async (filePath) => this.readCustomPack(filePath),
    );
  }

  private async readCustomPack(filePath: string): Promise<DiscoveryLabPack> {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = customPackFileSchema.parse(JSON.parse(raw));
    return {
      id: parsed.id,
      kind: "custom",
      name: parsed.name,
      description: parsed.description ?? "",
      thesis: parsed.thesis,
      targetPnlBand: parsed.targetPnlBand,
      defaultSources: parsed.defaultSources?.length ? parsed.defaultSources : DEFAULT_SOURCES,
      defaultProfile: parsed.defaultProfile ?? DEFAULT_PROFILE,
      thresholdOverrides: parsed.thresholdOverrides ?? {},
      recipes: parsed.recipes,
      updatedAt: parsed.updatedAt ?? (await fs.stat(filePath)).mtime.toISOString(),
      sourcePath: filePath,
    };
  }

  private async seedWorkspacePacks(): Promise<void> {
    const seeds = listWorkspaceDiscoveryLabPackSeeds();
    for (const seed of seeds) {
      const filePath = this.packFilePath(seed.id);
      try {
        await fs.access(filePath);
      } catch {
        await writeJsonFileAtomic(filePath, seed);
      }
    }
  }

  private async allocatePackId(name: string): Promise<string> {
    const base = slugify(name) || "custom-pack";
    const taken = new Set((await this.listPacks()).map((pack) => pack.id));
    if (!taken.has(base)) {
      return base;
    }
    let suffix = 2;
    while (taken.has(`${base}-${suffix}`)) {
      suffix += 1;
    }
    return `${base}-${suffix}`;
  }

  private packFilePath(packId: string): string {
    return path.join(this.packsDir, `${packId}.json`);
  }

  private async syncPacksToDb(packs: DiscoveryLabPack[]): Promise<void> {
    await Promise.all(packs.map(async (pack) => this.upsertPackRecord(pack)));
  }

  private async upsertPackRecord(pack: DiscoveryLabPack): Promise<void> {
    const discoveryLabPackData = {
      kind: mapPackKindForDb(pack),
      name: pack.name,
      description: pack.description,
      thesis: pack.thesis ?? null,
      targetPnlBand: pack.targetPnlBand ? toJsonValue(pack.targetPnlBand) : Prisma.DbNull,
      defaultProfile: pack.defaultProfile,
      defaultSources: toJsonValue(pack.defaultSources),
      thresholdOverrides: toJsonValue(pack.thresholdOverrides ?? {}),
      recipes: toJsonValue(pack.recipes),
      sourcePath: pack.sourcePath,
    } satisfies Prisma.DiscoveryLabPackUncheckedCreateInput;

    await db.discoveryLabPack.upsert({
      where: { id: pack.id },
      update: discoveryLabPackData,
      create: {
        id: pack.id,
        ...discoveryLabPackData,
      },
    });

    await this.upsertStrategyPackRecord(pack);
  }

  private async upsertStrategyPackRecord(pack: DiscoveryLabPack): Promise<void> {
    const snapshot = buildStrategyPackSnapshot(pack);
    const snapshotJson = toJsonValue(snapshot);
    const snapshotFingerprint = JSON.stringify(snapshotJson);

    await db.$transaction(async (tx) => {
      const existingPack = await tx.strategyPack.findUnique({
        where: { id: pack.id },
        select: { status: true, publishedAt: true },
      });
      const latestVersion = await tx.strategyPackVersion.findFirst({
        where: { packId: pack.id },
        orderBy: { version: "desc" },
        select: { version: true, configSnapshot: true },
      });
      const currentVersion = latestVersion?.version ?? 1;
      const latestFingerprint = latestVersion ? JSON.stringify(latestVersion.configSnapshot) : null;
      const nextVersion = latestFingerprint === snapshotFingerprint
        ? currentVersion
        : latestVersion
          ? latestVersion.version + 1
          : 1;

      await tx.strategyPack.upsert({
        where: { id: pack.id },
        update: {
          name: pack.name,
          version: nextVersion,
          recipe: toJsonValue(snapshot.recipe),
          baseFilters: toJsonValue(snapshot.baseFilters),
          baseExits: toJsonValue(snapshot.baseExits),
          adaptiveAxes: toJsonValue(snapshot.adaptiveAxes),
          capitalModifier: snapshot.capitalModifier,
          sortColumn: snapshot.sortColumn,
          sortOrder: snapshot.sortOrder,
          createdBy: snapshot.createdBy,
        },
        create: {
          id: pack.id,
          name: pack.name,
          version: nextVersion,
          status: existingPack?.status ?? "DRAFT",
          recipe: toJsonValue(snapshot.recipe),
          baseFilters: toJsonValue(snapshot.baseFilters),
          baseExits: toJsonValue(snapshot.baseExits),
          adaptiveAxes: toJsonValue(snapshot.adaptiveAxes),
          capitalModifier: snapshot.capitalModifier,
          sortColumn: snapshot.sortColumn,
          sortOrder: snapshot.sortOrder,
          publishedAt: existingPack?.publishedAt ?? null,
          createdBy: snapshot.createdBy,
        },
      });

      if (latestFingerprint !== snapshotFingerprint) {
        await tx.strategyPackVersion.create({
          data: {
            packId: pack.id,
            version: nextVersion,
            configSnapshot: snapshotJson,
            parentVersion: latestVersion?.version ?? null,
            notes: `discovery-lab ${pack.kind} sync`,
          },
        });
      }
    });
  }

  private async readJsonFiles<T>(
    dirPath: string,
    predicate: (entry: string) => boolean,
    mapFn?: (filePath: string) => Promise<T>,
  ): Promise<T[]> {
    try {
      const entries = await fs.readdir(dirPath);
      const values: T[] = [];
      for (const entry of entries.filter(predicate).sort()) {
        const filePath = path.join(dirPath, entry);
        try {
          if (mapFn) {
            values.push(await mapFn(filePath));
            continue;
          }
          const raw = await fs.readFile(filePath, "utf8");
          values.push(JSON.parse(raw) as T);
        } catch {
          continue;
        }
      }
      return values;
    } catch {
      return [];
    }
  }
}
