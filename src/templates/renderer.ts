/**
 * Template renderer — simple {{variable}} replacement engine.
 * No external dependency needed for this use case.
 *
 * Security:
 * - CWE-79: Templates produce configuration files, not HTML responses.
 *   These files are written to local disk, not served to browsers.
 * - Variable names are validated against alphanumeric pattern.
 */

type TemplateContext = Record<string, string | number | boolean>;

/**
 * Renders a template string by replacing {{variable}} placeholders.
 * Unknown variables are replaced with empty string.
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = context[key];
    if (value === undefined || value === null) return '';
    return String(value);
  });
}
