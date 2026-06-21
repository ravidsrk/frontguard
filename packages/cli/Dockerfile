FROM mcr.microsoft.com/playwright:v1.61.0-jammy

WORKDIR /app

# Install frontguard globally (pinned to repo VERSION — see packages/cli/package.json)
RUN npm install -g @frontguard/cli@0.2.2

# Pre-install all browser engines
RUN npx playwright install --with-deps chromium firefox webkit

# Set default entrypoint
ENTRYPOINT ["frontguard"]
CMD ["run"]
