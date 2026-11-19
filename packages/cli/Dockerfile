FROM mcr.microsoft.com/playwright:v1.65.0-jammy

WORKDIR /app

# Install frontguard globally (pinned to repo VERSION — see packages/cli/package.json)
RUN npm install -g @frontguard/cli@0.2.3

# Pre-install all browser engines
RUN npx playwright install --with-deps chromium firefox webkit \
 && chown -R pwuser:pwuser /app

# Opt-in to Chromium --no-sandbox only inside container builds, and run as non-root.
ENV FRONTGUARD_CHROMIUM_NO_SANDBOX=1
USER pwuser

# Set default entrypoint
ENTRYPOINT ["frontguard"]
CMD ["run"]
