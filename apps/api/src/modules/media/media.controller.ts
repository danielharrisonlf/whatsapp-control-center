import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { CursorQuerySchema, pageSchema, SuccessDto, success, zDate, zDateNullable } from '../../common/dto';
import {
  type AuthUser,
  CurrentMembership,
  CurrentUser,
  type OrgMembership,
  RequireAction,
} from '../auth/auth.decorators';
import { MediaService } from './media.service';

const MediaSchema = z
  .object({
    id: z.string(),
    metaMediaId: z.string(),
    phoneNumber: z.object({ id: z.string(), displayPhoneNumber: z.string().nullable() }),
    origin: z.enum(['UPLOADED', 'RECEIVED']),
    mimeType: z.string().nullable(),
    kind: z.enum(['image', 'video', 'audio', 'document', 'sticker']).nullable(),
    fileSize: z.number().nullable(),
    sha256: z.string().nullable(),
    fileName: z.string().nullable(),
    deletedAt: zDateNullable,
    estimatedExpiresAt: zDateNullable.describe('Meta keeps uploaded media for 7 days.'),
    createdAt: zDate,
  })
  .meta({ id: 'Media' });
class MediaDto extends createZodDto(MediaSchema) {}
class MediaPageDto extends createZodDto(pageSchema(MediaSchema, 'MediaPage')) {}
class MediaQueryDto extends createZodDto(
  CursorQuerySchema.extend({
    phoneNumberId: z.uuid().optional(),
    origin: z.enum(['UPLOADED', 'RECEIVED']).optional(),
  }),
) {}
class UploadMediaDto extends createZodDto(
  z.object({ phoneNumberId: z.uuid() }).meta({ id: 'UploadMediaInput' }),
) {}

@ApiTags('Media')
@Controller('organizations/:organizationId/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  @ApiOperation({ operationId: 'listMedia' })
  @ZodResponse({ type: MediaPageDto })
  list(@CurrentMembership() m: OrgMembership, @Query() q: MediaQueryDto) {
    return this.media.list(m.organizationId, q);
  }

  @Post()
  @RequireAction('media.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        phoneNumberId: { type: 'string', format: 'uuid' },
      },
      required: ['file', 'phoneNumberId'],
    },
  })
  @ApiOperation({ operationId: 'uploadMedia', summary: 'Upload media to Meta for a phone number' })
  @ZodResponse({ status: 201, type: MediaDto })
  upload(
    @CurrentMembership() m: OrgMembership,
    @CurrentUser() user: AuthUser,
    @Body() body: UploadMediaDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.media.upload(m.organizationId, user.id, body.phoneNumberId, file);
  }

  @Post(':mediaId/refresh')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'refreshMedia',
    summary: 'Read media metadata from Meta (detects expired media)',
  })
  @ZodResponse({ status: 200, type: MediaDto })
  refresh(@CurrentMembership() m: OrgMembership, @Param('mediaId', ParseUUIDPipe) id: string) {
    return this.media.refresh(m.organizationId, id);
  }

  @Get(':mediaId/download')
  @ApiProduces('application/octet-stream')
  @ApiOperation({
    operationId: 'downloadMedia',
    summary: 'Download through the API (Meta URLs expire after 5 minutes)',
  })
  async download(@CurrentMembership() m: OrgMembership, @Param('mediaId', ParseUUIDPipe) id: string) {
    const file = await this.media.download(m.organizationId, id);
    return new StreamableFile(file.data, {
      type: file.contentType,
      disposition: `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    });
  }

  @Delete(':mediaId')
  @RequireAction('media.manage')
  @ApiOperation({ operationId: 'deleteMedia' })
  @ZodResponse({ type: SuccessDto })
  async remove(@CurrentMembership() m: OrgMembership, @Param('mediaId', ParseUUIDPipe) id: string) {
    await this.media.delete(m.organizationId, id);
    return success;
  }
}
