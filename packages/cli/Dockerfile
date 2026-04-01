FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# Install frontguard globally
RUN npm install -g frontguard@latest

# Pre-install all browser engines
RUN npx playwright install --with-deps chromium firefox webkit

# Set default entrypoint
ENTRYPOINT ["frontguard"]
CMD ["run"]
