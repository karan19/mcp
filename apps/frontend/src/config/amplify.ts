import { Amplify } from 'aws-amplify';
import { appConfig } from './env';

let configured = false;

export function configureAmplify() {
  if (configured) {
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: appConfig.cognitoUserPoolId,
        userPoolClientId: appConfig.cognitoUserPoolClientId,
        loginWith: {
          email: true,
        },
      },
    },
  });

  configured = true;
}
