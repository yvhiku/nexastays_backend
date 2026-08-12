import { StaysController } from './stays.controller';
import type { ExploreListingsDto, ExploreMapDto } from './dto/explore-listings.dto';
import type { ExploreService } from './explore/explore.service';

const P0_FIELDS = [
  'amenity',
  'pets_allowed',
  'luxury_only',
  'family_friendly',
  'neighborhood',
  'near_lat',
  'near_lng',
  'near_radius_km',
] as const;

/**
 * Locks the Guest Listings P0: controller must forward all eight
 * ExploreListingsDto filter fields into ExploreService unchanged.
 */
describe('StaysController explore filter forwarding', () => {
  const p0Values = {
    amenity: 'wifi',
    pets_allowed: true,
    luxury_only: true,
    family_friendly: true,
    neighborhood: 'Maarif',
    near_lat: 33.5731,
    near_lng: -7.5898,
    near_radius_km: 5,
  } as const;

  let exploreListings: jest.Mock;
  let exploreMap: jest.Mock;
  let controller: StaysController;

  beforeEach(() => {
    exploreListings = jest.fn().mockResolvedValue({ items: [] });
    exploreMap = jest.fn().mockResolvedValue({ items: [] });
    controller = Object.create(StaysController.prototype) as StaysController;
    Object.assign(controller, {
      exploreService: { exploreListings, exploreMap } as unknown as ExploreService,
    });
  });

  it('exploreListings receives all eight P0 filter fields unchanged', async () => {
    const query = { ...p0Values } as ExploreListingsDto;
    await controller.explore(query);

    expect(exploreListings).toHaveBeenCalledTimes(1);
    const arg = exploreListings.mock.calls[0][0] as Record<string, unknown>;
    for (const key of P0_FIELDS) {
      expect(arg).toHaveProperty(key, p0Values[key]);
    }
  });

  it('exploreMap receives all eight P0 filter fields unchanged', async () => {
    const query = {
      ...p0Values,
      north: 34,
      south: 33,
      east: -7,
      west: -8,
    } as ExploreMapDto;
    await controller.exploreMap(query);

    expect(exploreMap).toHaveBeenCalledTimes(1);
    const arg = exploreMap.mock.calls[0][0] as Record<string, unknown>;
    for (const key of P0_FIELDS) {
      expect(arg).toHaveProperty(key, p0Values[key]);
    }
  });

  it('explore and exploreMap receive the same eight filter values for identical DTO filters', async () => {
    const filters = { ...p0Values };
    await controller.explore(filters as ExploreListingsDto);
    await controller.exploreMap({
      ...filters,
      north: 34,
      south: 33,
      east: -7,
      west: -8,
    } as ExploreMapDto);

    const listArg = exploreListings.mock.calls[0][0] as Record<string, unknown>;
    const mapArg = exploreMap.mock.calls[0][0] as Record<string, unknown>;
    for (const key of P0_FIELDS) {
      expect(mapArg[key]).toBe(listArg[key]);
      expect(listArg[key]).toBe(p0Values[key]);
    }
  });
});
