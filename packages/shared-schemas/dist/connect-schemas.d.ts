import { z } from "zod";
export declare const ConnectShopifySchema: z.ZodObject<{
    shop: z.ZodString;
}, z.core.$strip>;
export type ConnectShopifyInput = z.infer<typeof ConnectShopifySchema>;
export declare const ConnectEasyPostSchema: z.ZodObject<{
    apiKey: z.ZodString;
    fromAddress: z.ZodObject<{
        name: z.ZodString;
        company: z.ZodOptional<z.ZodString>;
        street1: z.ZodString;
        street2: z.ZodOptional<z.ZodString>;
        city: z.ZodString;
        state: z.ZodString;
        zip: z.ZodString;
        country: z.ZodString;
        phone: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ConnectEasyPostInput = z.infer<typeof ConnectEasyPostSchema>;
export declare const ConnectShippoSchema: z.ZodObject<{
    apiKey: z.ZodString;
    fromAddress: z.ZodObject<{
        name: z.ZodString;
        company: z.ZodOptional<z.ZodString>;
        street1: z.ZodString;
        street2: z.ZodOptional<z.ZodString>;
        city: z.ZodString;
        state: z.ZodString;
        zip: z.ZodString;
        country: z.ZodString;
        phone: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ConnectShippoInput = z.infer<typeof ConnectShippoSchema>;
export declare const ConnectResendSchema: z.ZodObject<{
    apiKey: z.ZodString;
}, z.core.$strip>;
export type ConnectResendInput = z.infer<typeof ConnectResendSchema>;
export declare const ConnectSendGridSchema: z.ZodObject<{
    apiKey: z.ZodString;
}, z.core.$strip>;
export type ConnectSendGridInput = z.infer<typeof ConnectSendGridSchema>;
export declare const ConnectMailgunSchema: z.ZodObject<{
    domain: z.ZodString;
    apiKey: z.ZodString;
}, z.core.$strip>;
export type ConnectMailgunInput = z.infer<typeof ConnectMailgunSchema>;
export declare const ConnectSlackSchema: z.ZodObject<{
    webhookUrl: z.ZodString;
}, z.core.$strip>;
export type ConnectSlackInput = z.infer<typeof ConnectSlackSchema>;
export declare const ConnectDiscordSchema: z.ZodObject<{
    webhookUrl: z.ZodString;
}, z.core.$strip>;
export type ConnectDiscordInput = z.infer<typeof ConnectDiscordSchema>;
export declare const ConnectOdooSchema: z.ZodObject<{
    url: z.ZodString;
    db: z.ZodString;
    username: z.ZodString;
    apiKey: z.ZodString;
}, z.core.$strip>;
export type ConnectOdooInput = z.infer<typeof ConnectOdooSchema>;
//# sourceMappingURL=connect-schemas.d.ts.map