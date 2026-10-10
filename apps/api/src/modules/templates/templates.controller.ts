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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { SuccessDto, success } from '../../common/dto';
import {
  type AuthUser,
  CurrentMembership,
  CurrentUser,
  type OrgMembership,
  RequireAction,
} from '../auth/auth.decorators';
import {
  CreateTemplateDto,
  CreateTemplateResultDto,
  DeleteTemplateQueryDto,
  EditTemplateDto,
  MediaHandleDto,
  SyncTemplatesDto,
  SyncTemplatesResultDto,
  TemplateDto,
  TemplateFacetsDto,
  TemplateFacetsQueryDto,
  TemplatePageDto,
  TemplateQueryDto,
} from './templates.dto';
import { TemplatesService } from './templates.service';

@ApiTags('Message templates')
@Controller('organizations/:organizationId/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @ApiOperation({
    operationId: 'listTemplates',
    summary: 'Templates from the local cache (sync to refresh from Meta)',
  })
  @ZodResponse({ type: TemplatePageDto })
  list(@CurrentMembership() m: OrgMembership, @Query() q: TemplateQueryDto) {
    return this.templates.list(m.organizationId, q);
  }

  @Get('facets')
  @ApiOperation({
    operationId: 'getTemplateFacets',
    summary: 'Counts by status, category and language for filters',
  })
  @ZodResponse({ type: TemplateFacetsDto })
  facets(@CurrentMembership() m: OrgMembership, @Query() q: TemplateFacetsQueryDto) {
    return this.templates.facets(m.organizationId, q.wabaId);
  }

  @Post()
  @RequireAction('templates.manage')
  @ApiOperation({
    operationId: 'createTemplate',
    summary: 'Validate and submit a template to Meta for review',
  })
  @ZodResponse({ status: 201, type: CreateTemplateResultDto })
  create(
    @CurrentMembership() m: OrgMembership,
    @CurrentUser() user: AuthUser,
    @Body() body: CreateTemplateDto,
  ) {
    return this.templates.create(m.organizationId, user.id, body.wabaId, body.payload);
  }

  @Post('sync')
  @HttpCode(200)
  @RequireAction('wabas.sync')
  @ApiOperation({ operationId: 'syncTemplates', summary: 'Meta → local sync of templates' })
  @ZodResponse({ status: 200, type: SyncTemplatesResultDto })
  sync(@CurrentMembership() m: OrgMembership, @Body() body: SyncTemplatesDto) {
    return this.templates.syncAll(m.organizationId, body.wabaId);
  }

  @Post('header-samples/:wabaId')
  @HttpCode(200)
  @RequireAction('templates.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    operationId: 'uploadTemplateHeaderSample',
    summary: 'Upload a media header sample and get its handle',
  })
  @ZodResponse({ status: 200, type: MediaHandleDto })
  upload(
    @CurrentMembership() m: OrgMembership,
    @Param('wabaId', ParseUUIDPipe) wabaId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.templates.uploadHeaderSample(m.organizationId, wabaId, file);
  }

  @Get(':templateId')
  @ApiOperation({ operationId: 'getTemplate' })
  @ZodResponse({ type: TemplateDto })
  get(@CurrentMembership() m: OrgMembership, @Param('templateId', ParseUUIDPipe) id: string) {
    return this.templates.get(m.organizationId, id);
  }

  @Post(':templateId/refresh')
  @HttpCode(200)
  @RequireAction('wabas.sync')
  @ApiOperation({
    operationId: 'refreshTemplate',
    summary: 'Re-read status, quality and rejection reason from Meta',
  })
  @ZodResponse({ status: 200, type: TemplateDto })
  refresh(@CurrentMembership() m: OrgMembership, @Param('templateId', ParseUUIDPipe) id: string) {
    return this.templates.refresh(m.organizationId, id);
  }

  @Post(':templateId/edit')
  @HttpCode(200)
  @RequireAction('templates.manage')
  @ApiOperation({
    operationId: 'editTemplate',
    summary: 'Edit components (approved: 1 edit/24h, 10/30 days). Name and language cannot change.',
  })
  @ZodResponse({ status: 200, type: TemplateDto })
  edit(
    @CurrentMembership() m: OrgMembership,
    @Param('templateId', ParseUUIDPipe) id: string,
    @Body() body: EditTemplateDto,
  ) {
    return this.templates.edit(m.organizationId, id, body);
  }

  @Delete(':templateId')
  @RequireAction('templates.manage')
  @ApiOperation({
    operationId: 'deleteTemplate',
    summary: 'Delete at Meta. Approved names cannot be reused for 30 days.',
  })
  @ZodResponse({ type: SuccessDto })
  async remove(
    @CurrentMembership() m: OrgMembership,
    @Param('templateId', ParseUUIDPipe) id: string,
    @Query() q: DeleteTemplateQueryDto,
  ) {
    await this.templates.delete(m.organizationId, id, q.allLanguages);
    return success;
  }
}
