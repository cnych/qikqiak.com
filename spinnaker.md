kubectl exec -it spinnaker-spinnaker-halyard-0 /bin/bash -n spinnaker
bash-5.0$ hal config artifact github account add cnych
+ Get current deployment
  Success
+ Add the cnych artifact account
  Success
+ Successfully added artifact account cnych for artifact provider
  github.

hal deploy apply

+ Get current deployment
  Success
+ Prep deployment
  Success
Validation in default.telemetry:
- INFO Telemetry is currently DISABLED. Usage statistics are not
  being collected. Please consider enabling statistic collection. These stats
  inform improvements to the product, and that helps the community. To enable, run
  `hal config telemetry enable`. To learn more about what and how telemetry data
  is used, please see https://www.spinnaker.io/community/stats.

Validation in default.security:
- WARNING Your UI or API domain does not have override base URLs
  set even though your Spinnaker deployment is a Distributed deployment on a
  remote cloud provider. As a result, you will need to open SSH tunnels against
  that deployment to access Spinnaker.
? We recommend that you instead configure an authentication
  mechanism (OAuth2, SAML2, or x509) to make it easier to access Spinnaker
  securely, and then register the intended Domain and IP addresses that your
  publicly facing services will be using.

+ Preparation complete... deploying Spinnaker
+ Get current deployment
  Success
+ Apply deployment
  Success
+ Deploy spin-clouddriver
  Success
+ Deploy spin-front50
  Success
+ Deploy spin-orca
  Success
+ Deploy spin-deck
  Success
+ Deploy spin-echo
  Success
+ Deploy spin-gate
  Success
+ Deploy spin-igor
  Success
+ Deploy spin-rosco
  Success
+ Run `hal deploy connect` to connect to Spinnaker.


$ hal config security ui edit --override-base-url https://spinnaker.qikqiak.com
+ Get current deployment
  Success
+ Get UI security settings
  Success
+ Edit UI security settings
  Success
+ Successfully updated UI security settings.

$ hal config security api edit --override-base-url https://spinnaker-gate.qikqiak.com
+ Get current deployment
  Success
+ Get API security settings
  Success
+ Edit API security settings
  Success

$ hal deploy apply
+ Get current deployment
  Success
+ Prep deployment
  Success
Validation in default.telemetry:
- INFO Telemetry is currently DISABLED. Usage statistics are not
  being collected. Please consider enabling statistic collection. These stats
  inform improvements to the product, and that helps the community. To enable, run
  `hal config telemetry enable`. To learn more about what and how telemetry data
  is used, please see https://www.spinnaker.io/community/stats.

+ Preparation complete... deploying Spinnaker
+ Get current deployment
  Success
+ Apply deployment
  Success
+ Deploy spin-clouddriver
  Success
+ Deploy spin-front50
  Success
+ Deploy spin-orca
  Success
+ Deploy spin-deck
  Success
+ Deploy spin-echo
  Success
+ Deploy spin-gate
  Success
+ Deploy spin-igor
  Success
+ Deploy spin-rosco
  Success
+ Run `hal deploy connect` to connect to Spinnaker.


$ USERNAME=cnych
$ ADDRESS=index.docker.io
$ REPOSITORIES=library/nginx
$ hal config provider docker-registry enable
+ Get current deployment
  Success
+ Edit the dockerRegistry provider
  Success
+ Successfully enabled dockerRegistry

$ hal config provider docker-registry account add my-docker-hub --address $ADDRESS --repositories $REPOSITORIES --username $USERNAME --password
Your docker registry password:
+ Get current deployment
  Success
+ Add the my-docker-hub account
  Success
+ Successfully added account my-docker-hub for provider
  dockerRegistry.

  