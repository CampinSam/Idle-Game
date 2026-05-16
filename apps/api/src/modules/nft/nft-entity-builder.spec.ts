import { buildEntityDataFromNftMetadata } from './nft-entity-builder';
import { NftMetadata } from './nft-ownership.interface';

function makeDef(initOverrides: any = {}) {
  return {
    id: 'derp_bird_nft',
    speciesId: 'derp_bird_nft',
    slots: { body: ['robin'], head: ['crested'] },
    traits: {
      robin: { slotStats: { body: { ATK: 2, DEF: 1 } }, scaling: { ATK: 1, DEF: 1 }, rarityMultiplier: 1.0 },
      crested: { slotStats: { head: { FOC: 1 } }, scaling: { FOC: 2 }, rarityMultiplier: 1.0 },
      defaultBody: { slotStats: { body: { ATK: 1 } }, scaling: { ATK: 1 }, rarityMultiplier: 1.0 },
    },
    init: {
      nft: {
        attributeMap: { body: 'body', head: 'head' },
        missingSlotPolicy: 'skip',
        defaults: {},
        ...initOverrides,
      },
    },
  };
}

function makePrisma(def: any) {
  return {
    entityDefinition: { findUnique: jest.fn(async () => def) },
  } as any;
}

const collection = {
  id: 'col-1',
  name: 'Test',
  chain: 'cardano',
  collectionId: 'pid',
  entityDefinitionId: 'derp_bird_nft',
};

function makeMeta(attrs: Record<string, string>): NftMetadata {
  return {
    assetId: 'a1',
    name: 'Bird #1',
    imageUrl: 'http://img/1.png',
    attributes: attrs,
    rawMeta: {},
  };
}

describe('buildEntityDataFromNftMetadata — missingSlotPolicy', () => {
  describe('"error"', () => {
    it('throws when an NFT is missing an attribute for a defined slot', async () => {
      const def = makeDef({ missingSlotPolicy: 'error' });
      const prisma = makePrisma(def);
      const meta = makeMeta({ body: 'robin' }); // head missing
      await expect(
        buildEntityDataFromNftMetadata(prisma, collection, meta),
      ).rejects.toThrow(/missing required attribute for slot "head"/);
    });

    it('builds successfully when all slot attributes are present', async () => {
      const def = makeDef({ missingSlotPolicy: 'error' });
      const prisma = makePrisma(def);
      const meta = makeMeta({ body: 'robin', head: 'crested' });
      const result = await buildEntityDataFromNftMetadata(prisma, collection, meta);
      expect(result.traits).toEqual({ body: 'robin', head: 'crested' });
      expect(result.stats.ATK).toBe(2);
      expect(result.stats.DEF).toBe(1);
      expect(result.stats.FOC).toBe(1);
    });
  });

  describe('"skip"', () => {
    it('omits the missing slot from traits and applies no stats for it', async () => {
      const def = makeDef({ missingSlotPolicy: 'skip' });
      const prisma = makePrisma(def);
      const meta = makeMeta({ body: 'robin' }); // head missing
      const result = await buildEntityDataFromNftMetadata(prisma, collection, meta);
      expect(result.traits).toEqual({ body: 'robin' });
      expect(result.traits.head).toBeUndefined();
      expect(result.stats.ATK).toBe(2);
      expect(result.stats.FOC).toBe(0);
    });
  });

  describe('"default"', () => {
    it('falls back to the configured default trait when the attribute is missing', async () => {
      const def = makeDef({ missingSlotPolicy: 'default', defaults: { body: 'defaultBody' } });
      const prisma = makePrisma(def);
      const meta = makeMeta({ head: 'crested' }); // body missing → uses defaultBody
      const result = await buildEntityDataFromNftMetadata(prisma, collection, meta);
      expect(result.traits.body).toBe('defaultbody');
      expect(result.stats.ATK).toBe(1); // from defaultBody.slotStats.body.ATK
      expect(result.stats.FOC).toBe(1);
    });

    it('skips the slot when no default is configured for it', async () => {
      const def = makeDef({ missingSlotPolicy: 'default', defaults: {} });
      const prisma = makePrisma(def);
      const meta = makeMeta({ head: 'crested' }); // body missing, no default
      const result = await buildEntityDataFromNftMetadata(prisma, collection, meta);
      expect(result.traits.body).toBeUndefined();
      expect(result.traits.head).toBe('crested');
    });
  });

  it('throws on an invalid missingSlotPolicy value', async () => {
    const def = makeDef({ missingSlotPolicy: 'bogus' });
    const prisma = makePrisma(def);
    const meta = makeMeta({ body: 'robin', head: 'crested' });
    await expect(buildEntityDataFromNftMetadata(prisma, collection, meta)).rejects.toThrow(
      /invalid `init.nft.missingSlotPolicy`/,
    );
  });
});
