import { adjustInventorySchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class AdjustInventoryDto extends createZodDto(adjustInventorySchema) {}
