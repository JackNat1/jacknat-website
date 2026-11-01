// Google Ads conversion settings.
// Replace the placeholders with the values from Google Ads → Goals → Conversions.
// Leave them as written until then. js/campaign.js will not load gtag and will
// not send a conversion while either value is still a placeholder.
//
// googleAdsId: the account conversion ID, shaped like AW-1234567890.
// labels.homeownerConsultation: label for "Consultation Form Submit".
//   Sent only from /smart-living/thank-you after that form is submitted.
// labels.builderMeeting: a separate label for the builder meeting request.
//   Sent only from /builder-partners/thank-you. It must stay a placeholder
//   until that separate conversion action exists, so the builder page does
//   not send the homeowner consultation conversion.
window.JACKNAT_ADS = {
  googleAdsId: "AW-REPLACE_ME",
  labels: {
    homeownerConsultation: "REPLACE_ME",
    builderMeeting: "REPLACE_ME"
  }
};
