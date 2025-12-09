/**
 * Authentication debugging utilities
 * 
 * TODO: Adapt for Better-Auth debugging
 * Currently uses localStorage token - needs migration to Better-Auth session
 */

export interface TokenInfo {
  exists: boolean;
  preview?: string;
  decoded?: any;
  isExpired?: boolean;
  expiresAt?: Date;
  timeUntilExpiry?: number;
}

/**
 * Decode JWT token without verification (for debugging only)
 */
export function decodeJWT(token: string): any {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return decoded;
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
}

/**
 * Get detailed token information for debugging
 * TODO: Replace with Better-Auth session debugging
 */
export function getTokenInfo(): TokenInfo {
  const token = localStorage.getItem("authToken");
  
  if (!token) {
    return { exists: false };
  }

  const decoded = decodeJWT(token);
  const info: TokenInfo = {
    exists: true,
    preview: token.substring(0, 50) + '...',
    decoded
  };

  if (decoded && decoded.exp) {
    const expiresAt = new Date(decoded.exp * 1000);
    const now = new Date();
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    
    info.expiresAt = expiresAt;
    info.timeUntilExpiry = timeUntilExpiry;
    info.isExpired = timeUntilExpiry <= 0;
  }

  return info;
}

/**
 * Log detailed authentication status for debugging
 * TODO: Replace with Better-Auth session status
 */
export function logAuthStatus() {
  const tokenInfo = getTokenInfo();
  
  console.group('🔐 Authentication Status');
  console.log('Token exists:', tokenInfo.exists);
  
  if (tokenInfo.exists) {
    console.log('Token preview:', tokenInfo.preview);
    console.log('Token decoded:', tokenInfo.decoded);
    
    if (tokenInfo.expiresAt) {
      console.log('Expires at:', tokenInfo.expiresAt.toLocaleString());
      console.log('Time until expiry:', Math.round((tokenInfo.timeUntilExpiry || 0) / 1000 / 60), 'minutes');
      console.log('Is expired:', tokenInfo.isExpired);
    }
  }
  
  console.groupEnd();
  
  return tokenInfo;
}

/**
 * Check if user is authenticated and token is valid
 * TODO: Replace with Better-Auth session check
 */
export function isAuthenticated(): boolean {
  const tokenInfo = getTokenInfo();
  return tokenInfo.exists && !tokenInfo.isExpired;
}




