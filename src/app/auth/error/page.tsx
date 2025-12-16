import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  let title = "Authentication Error";
  let description = "An unexpected error occurred during authentication. Please try again.";
  const showLoginButton = true;
  const redirectUrl = "/auth/signin";

  switch (error) {
    case "PASSWORD_CHANGE_REQUIRED":
      // Redirect to password change page instead of showing error
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-center">Password Change Required</CardTitle>
              <CardDescription className="text-center">
                <Alert variant="destructive">
                  <ExclamationTriangleIcon className="h-4 w-4" />
                  <AlertTitle>Action Required</AlertTitle>
                  <AlertDescription>
                    You must change your password before continuing.
                  </AlertDescription>
                </Alert>
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Link href="/auth/change-password-required">
                <Button className="w-full">Change Password</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      );
    case "CredentialsSignin":
      title = "Invalid Credentials";
      description = "The email/username or password you entered is incorrect. Please try again.";
      break;
    case "2FA_REQUIRED":
      title = "Two-Factor Authentication Required";
      description = "Please provide your authenticator code to complete login.";
      break;
    case "INVALID_2FA_CODE":
      title = "Invalid Authenticator Code";
      description = "The two-factor authentication code you entered is incorrect. Please try again.";
      break;
    case "EMAIL_NOT_VERIFIED":
      title = "Email Not Verified";
      description = "Your email address has not been verified. Please check your inbox for a verification link or contact your administrator.";
      break;
    case "ACCOUNT_SUSPENDED":
      title = "Account Suspended";
      description = "Your account has been suspended. Please contact your network administrator for assistance.";
      break;
    case "ACCOUNT_PENDING":
      title = "Account Pending Approval";
      description = "Your account is pending approval. Please contact your network administrator for assistance.";
      break;
    case "OidcSigninDisabled":
      title = "OIDC Login Disabled";
      description = "Login via this external provider is currently disabled. Please contact your administrator.";
      break;
    case "OidcEmailMissing":
      title = "OIDC Email Missing";
      description = "Your OIDC provider did not provide an email address. Please contact your administrator.";
      break;
    case "SigninCallbackError":
      title = "Login Error";
      description = "An internal server error occurred during login. Please try again or contact your administrator.";
      break;
    case "UserNotFound":
      title = "User Not Found";
      description = "The user account could not be found. Please contact your administrator.";
      break;
    default:
      // Generic error message
      break;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">{title}</CardTitle>
          <CardDescription className="text-center">
            <Alert variant="destructive">
              <ExclamationTriangleIcon className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {description}
              </AlertDescription>
            </Alert>
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {showLoginButton && (
            <Link href={redirectUrl}>
              <Button className="w-full">Return to Login</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}