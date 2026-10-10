import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  type RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../auth/auth.decorators';
import { WebhookReceiverService } from './webhook-receiver.service';

/**
 * Public endpoints Meta calls.
 * - `/webhooks/meta`: platform app (Embedded Signup connections), secrets from the environment.
 * - `/webhooks/meta/c/:endpointKey`: connections that brought their own Meta app.
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('webhooks/meta')
export class MetaWebhookController {
  constructor(private readonly receiver: WebhookReceiverService) {}

  @Get()
  verifyPlatform(@Query() query: Record<string, string>, @Res() res: Response) {
    return this.verify(undefined, query, res);
  }

  @Get('c/:endpointKey')
  verifyConnection(
    @Param('endpointKey') key: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    return this.verify(key, query, res);
  }

  @Post()
  @HttpCode(200)
  receivePlatform(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
    @Res() res: Response,
  ) {
    return this.receive(undefined, req, headers, res);
  }

  @Post('c/:endpointKey')
  @HttpCode(200)
  receiveConnection(
    @Param('endpointKey') key: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
    @Res() res: Response,
  ) {
    return this.receive(key, req, headers, res);
  }

  private async verify(key: string | undefined, query: Record<string, string>, res: Response) {
    const challenge = await this.receiver.verifySubscription(
      key,
      query['hub.mode'],
      query['hub.verify_token'],
      query['hub.challenge'],
    );
    if (challenge === null) return res.status(403).type('text/plain').send('Verification failed');
    return res.status(200).type('text/plain').send(challenge);
  }

  private async receive(
    key: string | undefined,
    req: RawBodyRequest<Request>,
    headers: Record<string, string>,
    res: Response,
  ) {
    const result = await this.receiver.receive(key, req.rawBody, headers);
    if (result.reason === 'unknown-endpoint')
      return res.status(404).type('text/plain').send('Unknown webhook endpoint');
    if (!result.accepted) return res.status(403).type('text/plain').send('Invalid signature');
    return res.status(200).type('text/plain').send('EVENT_RECEIVED');
  }
}
