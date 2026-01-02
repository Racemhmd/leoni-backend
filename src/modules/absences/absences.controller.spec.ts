import { Test, TestingModule } from '@nestjs/testing';
import { AbsencesController } from './absences.controller';

describe('AbsencesController', () => {
  let controller: AbsencesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AbsencesController],
    }).compile();

    controller = module.get<AbsencesController>(AbsencesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
