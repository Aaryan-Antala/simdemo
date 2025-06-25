# SimAlly - Authentication and Route Protection Implementation

## Route Protection

This project uses a `ProtectedRoute` component to handle authentication state and route protection. Here's how it works:

### ProtectedRoute Component

The `ProtectedRoute` component wraps any route that requires authentication. It:

1. Shows a loading state while authentication is being checked
2. Redirects unauthenticated users to the landing page
3. Preserves the route on refresh by checking authentication before redirecting

### Usage in App Routes

Protected routes are wrapped with the `ProtectedRoute` component in the main App.tsx:

```tsx
<Route path="/dashboard" element={
  <ProtectedRoute>
    <Dashboard />
  </ProtectedRoute>
} />
```

### Benefits

- **Persistent Routes**: Users remain on their current page after refresh
- **Centralized Authentication Logic**: Authentication is handled in one place
- **Improved UX**: Shows proper loading states during authentication checks
- **State Preservation**: Preserves route parameters and state during refresh

### Implementation Details

1. The auth service checks localStorage for a valid session token on app initialization
2. The `ProtectedRoute` component waits for authentication to complete before deciding to redirect
3. Each protected page component no longer redirects users directly, relying on the `ProtectedRoute` instead

This implementation follows React best practices for authentication in single-page applications.
