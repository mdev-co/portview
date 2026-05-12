import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { VesselsController } from '../vessels.controller';
import { VesselsService } from '../vessels.service';

type MockService = {
  listVessels: jest.Mock;
  getVessel: jest.Mock;
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

    it('coerces limit from string query param', async () => {
      service.listVessels.mockResolvedValue([]);
      await controller.list({ limit: '50' });
      expect(service.listVessels).toHaveBeenCalledWith(50);
    });

    it('rejects limit above 500 with HTTP 400', async () => {
      await expect(controller.list({ limit: '999' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects limit below 1 with HTTP 400', async () => {
      await expect(controller.list({ limit: '0' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects non-numeric limit with HTTP 400', async () => {
      await expect(controller.list({ limit: 'abc' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('wraps result in { vessels: [...] }', async () => {
      const vessel = {
        mmsi: 1,
        imo: null,
        name: null,
        callSign: null,
        shipType: null,
        destination: null,
        eta: null,
        lastSeenAt: null,
        position: null,
      };
      service.listVessels.mockResolvedValue([vessel]);
      await expect(controller.list({})).resolves.toEqual({ vessels: [vessel] });
    });
  });

  describe('GET /vessels/:mmsi', () => {
    it('returns vessel when found', async () => {
      const vessel = {
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
      service.getVessel.mockResolvedValue(vessel);
      await expect(controller.byMmsi({ mmsi: '261000000' })).resolves.toEqual(
        vessel,
      );
    });

    it('coerces mmsi from string param', async () => {
      service.getVessel.mockResolvedValue({
        mmsi: 1,
        imo: null,
        name: null,
        callSign: null,
        shipType: null,
        destination: null,
        eta: null,
        lastSeenAt: null,
        position: null,
      });
      await controller.byMmsi({ mmsi: '1' });
      expect(service.getVessel).toHaveBeenCalledWith(1);
    });

    it('throws NotFoundException when vessel does not exist', async () => {
      service.getVessel.mockResolvedValue(null);
      await expect(controller.byMmsi({ mmsi: '999' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects non-positive mmsi with HTTP 400', async () => {
      await expect(controller.byMmsi({ mmsi: '-1' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.byMmsi({ mmsi: '0' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects non-numeric mmsi with HTTP 400', async () => {
      await expect(controller.byMmsi({ mmsi: 'abc' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
