import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { CursorQuerySchema, SuccessDto, success } from '../../common/dto';
import {
  type AuthUser,
  CurrentMembership,
  CurrentUser,
  type OrgMembership,
  RequireAction,
} from '../auth/auth.decorators';
import {
  ConversationDto,
  ConversationPageDto,
  ConversationQueryDto,
  MessageDetailDto,
  MessagePageDto,
  MessageQueryDto,
  SendMessageDto,
  SendResultDto,
} from './messages.dto';
import { MessagesService } from './messages.service';

class PageQueryDto extends createZodDto(CursorQuerySchema) {}

@ApiTags('Messages')
@Controller('organizations/:organizationId')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post('messages')
  @HttpCode(200)
  @RequireAction('messages.send')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'sendMessage',
    summary:
      'Send a message through the Cloud API. Meta errors are returned in the result, not as HTTP errors.',
  })
  @ZodResponse({ status: 200, type: SendResultDto })
  send(@CurrentMembership() m: OrgMembership, @CurrentUser() user: AuthUser, @Body() body: SendMessageDto) {
    return this.messages.send(m.organizationId, user.id, body);
  }

  @Get('messages')
  @ApiOperation({
    operationId: 'listMessages',
    summary: 'Messages this app sent or received (history starts when the app saw them)',
  })
  @ZodResponse({ type: MessagePageDto })
  list(@CurrentMembership() m: OrgMembership, @Query() q: MessageQueryDto) {
    return this.messages.list(m.organizationId, q);
  }

  @Get('messages/:messageId')
  @ApiOperation({ operationId: 'getMessage' })
  @ZodResponse({ type: MessageDetailDto })
  get(@CurrentMembership() m: OrgMembership, @Param('messageId', ParseUUIDPipe) id: string) {
    return this.messages.get(m.organizationId, id);
  }

  @Post('messages/:messageId/read')
  @HttpCode(200)
  @RequireAction('messages.send')
  @ApiOperation({ operationId: 'markMessageRead', summary: 'Mark an inbound message as read (blue ticks)' })
  @ZodResponse({ status: 200, type: SuccessDto })
  async read(@CurrentMembership() m: OrgMembership, @Param('messageId', ParseUUIDPipe) id: string) {
    await this.messages.markAsRead(m.organizationId, id);
    return success;
  }

  @Post('messages/:messageId/typing')
  @HttpCode(200)
  @RequireAction('messages.send')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'sendTypingIndicator',
    summary: 'Mark an inbound message as read and show the typing indicator',
  })
  @ZodResponse({ status: 200, type: SuccessDto })
  async typing(@CurrentMembership() m: OrgMembership, @Param('messageId', ParseUUIDPipe) id: string) {
    await this.messages.markAsRead(m.organizationId, id, true);
    return success;
  }

  @Get('conversations')
  @ApiOperation({ operationId: 'listConversations' })
  @ZodResponse({ type: ConversationPageDto })
  conversations(@CurrentMembership() m: OrgMembership, @Query() q: ConversationQueryDto) {
    return this.messages.conversations(m.organizationId, q);
  }

  @Get('conversations/:contactId')
  @ApiOperation({ operationId: 'getConversation' })
  @ZodResponse({ type: ConversationDto })
  conversation(@CurrentMembership() m: OrgMembership, @Param('contactId', ParseUUIDPipe) id: string) {
    return this.messages.conversation(m.organizationId, id);
  }

  @Get('conversations/:contactId/messages')
  @ApiOperation({ operationId: 'listConversationMessages', summary: 'Newest first' })
  @ZodResponse({ type: MessagePageDto })
  conversationMessages(
    @CurrentMembership() m: OrgMembership,
    @Param('contactId', ParseUUIDPipe) id: string,
    @Query() q: PageQueryDto,
  ) {
    return this.messages.conversationMessages(m.organizationId, id, q);
  }
}
