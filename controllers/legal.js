const POLICY_METADATA = Object.freeze({
  effectiveDate: "November 2026",
  operatorName: "Wanderlust",
  contactLabel: "Account & Platform Inquiries (via authenticated profile/dashboard)",
});

module.exports.renderPrivacyPolicy = (req, res) => {
  res.render("legal/privacy.ejs", {
    pageTitle: "Privacy Policy",
    ...POLICY_METADATA,
  });
};

module.exports.renderTerms = (req, res) => {
  res.render("legal/terms.ejs", {
    pageTitle: "Terms and Conditions",
    ...POLICY_METADATA,
  });
};

