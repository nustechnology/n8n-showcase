import * as dns from 'node:dns';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Agent, setGlobalDispatcher } from 'undici';

import 'reflect-metadata';

import { AppModule } from './app.module';

// Prefer IPv4 for outbound DNS lookups made via dns.lookup() (e.g. Prisma's
// engine, any http/https-core-module consumer). Some dev/host machines
// advertise a dead IPv6 default route, which makes IPv6 connection attempts
// fail against any dual-stack host (e.g. *.myshopify.com, api.easypost.com)
// even though IPv4 works fine — see README.
dns.setDefaultResultOrder('ipv4first');

// dns.setDefaultResultOrder above does NOT reliably cover Node's native
// fetch() — undici (what fetch is built on) does its own connection
// handling and doesn't consistently honor that setting. Confirmed on this
// project: with only the dns fix in place, fetch('https://api.easypost.com/...')
// still threw a bare "TypeError: fetch failed" (Nest's ExceptionsHandler
// logs just that one line, no underlying cause) despite IPv4 working fine
// via curl -4 to the same host. Forcing every fetch() dispatcher connection
// to IPv4 explicitly is what actually fixes it — every adapter in
// src/integrations/adapters/ calls the third party via plain fetch(), so
// this needs to be global, not per-adapter.
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

async function bootstrap() {
  // rawBody: true — the Clerk webhook handler needs the exact bytes Clerk
  // sent (req.rawBody) to verify the Svix signature; a re-serialized
  // req.body would produce a different signature and always fail.
  // No global ValidationPipe: validation is per-route via ZodValidationPipe
  // (src/common/pipes) applied to individual @Body()/@Query() params.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // FRONTEND_URL is already the single source of truth for "where the
  // frontend lives" (used for the post-OAuth redirect too) — reused here
  // rather than a second env var. No credentials: true — auth is a
  // manually-attached Authorization header, not a cookie, so the browser
  // doesn't need cross-origin cookie access.
  const config = app.get(ConfigService);
  app.enableCors({
    origin: config.getOrThrow<string>('FRONTEND_URL'),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id'],
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
