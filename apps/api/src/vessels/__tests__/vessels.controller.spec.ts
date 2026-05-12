import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { VesselsController } from '../vessels.controller';
import { VesselsService } from '../vessels.service';

type MockService = {
  listVessels: jest.Mock;
  getVessel: jest.Mock;
};

const SAMPLE_VESSEL = {
  mmsi: 261000000,
  imo: null,
  name: null,
  callSign: null,
  shipType: null,
  destination: null,
  eta: null,
  lastSeenAt: null,
  position: null,
};

describe('VesselsController', () => {
  let controller: VesselsController;
  let service: MockService;

  beforeEach(async () => {
    service = {
      listVessels: jest.fn(),
      getVessel: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [VesselsController],
      providers: [{ provide: VesselsService, useValue: service }],
    }).compile();

    controller = moduleRef.get(VesselsController);
  });

  describe('GET /vessels', () => {
    it('defaults limit to 100 when query empty', async () => {
      service.listVessels.mockResolvedValue([]);
      await controller.list({});
      expect(service.listVessels).toHaveBeenCalledWith(100);
    });

    it('forwards the provided limit to the service', async () => {
      service.listVessels.mockResolvedValue([]);
      await controller.list({ limit: 50 });
      expect(service.listVessels).toHaveBeenCalledWith(50);
    });

    it('wraps result in { vessels: [...] }', async () => {
      service.listVessels.mockResolvedValue([SAMPLE_VESSEL]);
      await expect(controller.list({})).resolves.toEqual({
        vessels: [SAMPLE_VESSEL],
      });
    });
  });

  describe('GET /vessels/:mmsi', () => {
    it('returns vessel when found', async () => {
      service.getVessel.mockResolvedValue(SAMPLE_VESSEL);
      await expect(controller.byMmsi(261000000)).resolves.toEqual(
        SAMPLE_VESSEL,
      );
      expect(service.getVessel).toHaveBeenCalledWith(261000000);
    });

    it('throws NotFoundException when vessel does not exist', async () => {
      service.getVessel.mockResolvedValue(null);
      await expect(controller.byMmsi(999)).rejects.toThrow(NotFoundException);
    });
  });
});
