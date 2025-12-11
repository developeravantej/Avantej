/**
 * oRPC Tenant Middleware
 * 
 * Extracts organizationId from oRPC request body and sets up tenant DB context
 * This runs before createContext to ensure tenant DB is available for oRPC handlers
 * 
 * This middleware is necessary because oRPC routes don't go through tenantMiddleware,
 * so we need to extract organizationId from the request body and set up tenant DB here.
 */

import { createMiddleware } from "hono/factory";
import { getTenantDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { members } from "@avantej-core/db/schema/tenant/members";
import { getDescendantNodeIds } from "@avantej-core/services";
import { getBetterAuth } from "@/lib/better-auth";

export const orpcTenantMiddleware = createMiddleware(async (c, next) => {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orpc-tenant.middleware.ts:18',message:'Middleware entry',data:{path:c.req.path,method:c.req.method},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  
  // Only process oRPC routes
  if (!c.req.path.startsWith('/rpc')) {
    await next();
    return;
  }

  try {
    // Parse request body to extract organizationId
    // Clone request to avoid consuming the body stream
    const clonedRequest = c.req.raw.clone();
    const contentType = clonedRequest.headers.get('content-type');
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orpc-tenant.middleware.ts:30',message:'Before body parse',data:{contentType,path:c.req.path},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (contentType?.includes('application/json')) {
      let body;
      try {
        body = await clonedRequest.json();
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orpc-tenant.middleware.ts:36',message:'Body parsed',data:{bodyKeys:body?Object.keys(body):[],hasJson:!!body?.json,jsonType:body?.json?typeof body.json:'none',bodyPreview:JSON.stringify(body).substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
      } catch (parseError) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orpc-tenant.middleware.ts:40',message:'Body parse failed',data:{error:parseError instanceof Error ? parseError.message : String(parseError),path:c.req.path},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        console.error("Failed to parse oRPC request body:", {
          error: parseError instanceof Error ? parseError.message : String(parseError),
          path: c.req.path,
          contentType,
        });
        await next();
        return;
      }
      
      // oRPC format can be:
      // 1. Direct: { jsonrpc: "2.0", method: "...", params: { input: {...} } }
      // 2. Wrapped: { json: { jsonrpc: "2.0", method: "...", params: { input: {...} } } }
      // 3. String wrapped: { json: "{\"jsonrpc\":\"2.0\",...}" }
      
      let rpcPayload = body;
      
      // Handle wrapped format
      if (body.json) {
        if (typeof body.json === 'string') {
          try {
            rpcPayload = JSON.parse(body.json);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orpc-tenant.middleware.ts:56',message:'Parsed body.json string',data:{rpcPayloadKeys:rpcPayload?Object.keys(rpcPayload):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
          } catch (e) {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orpc-tenant.middleware.ts:60',message:'Failed to parse body.json string',data:{error:e instanceof Error ? e.message : String(e)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            console.error("Failed to parse body.json string:", e);
            await next();
            return;
          }
        } else {
          rpcPayload = body.json;
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orpc-tenant.middleware.ts:66',message:'Using body.json object',data:{rpcPayloadKeys:rpcPayload?Object.keys(rpcPayload):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
        }
      }
      
      // Extract organizationId from oRPC payload
      // oRPC can send in different formats:
      // 1. { params: { input: { organizationId: "..." } } } - standard oRPC format
      // 2. { organizationId: "..." } - direct format (what we're actually receiving)
      const organizationId = rpcPayload?.params?.input?.organizationId || rpcPayload?.organizationId;
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orpc-tenant.middleware.ts:72',message:'Extracted organizationId',data:{organizationId,hasParams:!!rpcPayload?.params,hasInput:!!rpcPayload?.params?.input,hasDirectOrgId:!!rpcPayload?.organizationId,rpcPayloadKeys:rpcPayload?Object.keys(rpcPayload):[],paramsKeys:rpcPayload?.params?Object.keys(rpcPayload.params):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      if (!organizationId) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orpc-tenant.middleware.ts:76',message:'No organizationId found',data:{path:c.req.path,method:rpcPayload?.method,hasParams:!!rpcPayload?.params,hasInput:!!rpcPayload?.params?.input,bodyKeys:body?Object.keys(body):[],rpcPayloadKeys:rpcPayload?Object.keys(rpcPayload):[],rpcPayloadPreview:JSON.stringify(rpcPayload).substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        console.warn("No organizationId found in oRPC request:", {
          path: c.req.path,
          method: rpcPayload?.method,
          hasParams: !!rpcPayload?.params,
          hasInput: !!rpcPayload?.params?.input,
          bodyKeys: body ? Object.keys(body) : [],
          rpcPayloadKeys: rpcPayload ? Object.keys(rpcPayload) : [],
          rpcPayloadPreview: JSON.stringify(rpcPayload).substring(0, 200), // First 200 chars for debugging
        });
        await next();
        return;
      }

      try {
        // Get user from Better-Auth session (more reliable than context.get("user"))
        const auth = getBetterAuth(c);
        const session = await auth.api.getSession({
          headers: c.req.raw.headers,
        });
        
        const user = session?.user;
        
        if (!user) {
          console.warn("No user session found in oRPC middleware for organization:", organizationId);
          await next();
          return;
        }

        // Set up tenant DB using request-scoped pool
        let tenantDb;
        try {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orpc-tenant.middleware.ts:85',message:'Before getTenantDb',data:{organizationId,hasContext:!!c},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          tenantDb = await getTenantDb(organizationId, c);
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orpc-tenant.middleware.ts:88',message:'getTenantDb succeeded',data:{organizationId,hasTenantDb:!!tenantDb},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          console.log("✅ Tenant DB set up successfully for organization:", organizationId);
        } catch (tenantDbError) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orpc-tenant.middleware.ts:92',message:'getTenantDb failed',data:{error:tenantDbError instanceof Error ? tenantDbError.message : String(tenantDbError),organizationId,errorName:tenantDbError instanceof Error ? tenantDbError.name : undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          console.error("❌ getTenantDb failed:", {
            error: tenantDbError instanceof Error ? tenantDbError.message : String(tenantDbError),
            organizationId,
            errorName: tenantDbError instanceof Error ? tenantDbError.name : undefined,
            stack: tenantDbError instanceof Error ? tenantDbError.stack : undefined,
          });
          // Don't set tenantDb - let handler return proper error
          await next();
          return;
        }
        
        c.set('organizationId', organizationId);
        c.set('tenantDb', tenantDb);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orpc-tenant.middleware.ts:104',message:'Context set with tenantDb',data:{organizationId,hasTenantDb:!!c.get('tenantDb'),hasOrgId:!!c.get('organizationId')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        // Get member record
        const member = await tenantDb.query.members.findFirst({
          where: eq(members.userId, user.id),
        });
        
        if (!member) {
          console.error(`Member not found for user ${user.id} in organization ${organizationId}`);
          // Still set tenantDb so handler can return proper error
          await next();
          return;
        }

        // Calculate accessible node IDs
        const accessibleNodeIds = await getDescendantNodeIds(tenantDb, member.hierarchyScopeId);
        
        c.set('member', member);
        c.set('accessibleNodeIds', accessibleNodeIds);
      } catch (dbError) {
        console.error("Failed to set up tenant DB in oRPC middleware:", {
          error: dbError instanceof Error ? dbError.message : String(dbError),
          organizationId,
          stack: dbError instanceof Error ? dbError.stack : undefined,
        });
        // Don't re-throw - let handler return proper error based on missing tenantDb
        await next();
        return;
      }
    } else {
      console.warn("oRPC request missing JSON content-type:", {
        contentType,
        path: c.req.path,
      });
    }
  } catch (error) {
    // Log but don't fail - createContext/handler will handle errors appropriately
    console.error("Unexpected error in oRPC tenant middleware:", {
      error: error instanceof Error ? error.message : String(error),
      path: c.req.path,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  await next();
});

