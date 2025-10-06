#!/bin/bash

# Workflow Validation Script
# Validates GitHub Actions workflow files for common issues

echo "🔍 Validating GitHub Actions Workflows..."
echo ""

WORKFLOWS_DIR=".github/workflows"
ERRORS=0

if [ ! -d "$WORKFLOWS_DIR" ]; then
    echo "❌ Error: .github/workflows directory not found"
    exit 1
fi

echo "📁 Found workflows directory"
echo ""

# Count workflow files
WORKFLOW_COUNT=$(find "$WORKFLOWS_DIR" -name "*.yml" -o -name "*.yaml" | wc -l | tr -d ' ')
echo "📊 Total workflow files: $WORKFLOW_COUNT"
echo ""

# Check each workflow file
for workflow in "$WORKFLOWS_DIR"/*.yml "$WORKFLOWS_DIR"/*.yaml; do
    if [ ! -f "$workflow" ]; then
        continue
    fi
    
    filename=$(basename "$workflow")
    echo "Checking: $filename"
    
    # Check for required fields
    if ! grep -q "^name:" "$workflow"; then
        echo "  ⚠️  Warning: Missing 'name' field"
        ((ERRORS++))
    fi
    
    if ! grep -q "^on:" "$workflow"; then
        echo "  ❌ Error: Missing 'on' trigger field"
        ((ERRORS++))
    fi
    
    if ! grep -q "^jobs:" "$workflow"; then
        echo "  ❌ Error: Missing 'jobs' field"
        ((ERRORS++))
    fi
    
    # Check for common issues
    if grep -q "uses: actions/checkout@v3" "$workflow"; then
        echo "  ⚠️  Consider updating to actions/checkout@v4"
    fi
    
    if grep -q "uses: actions/setup-node@v3" "$workflow"; then
        echo "  ⚠️  Consider updating to actions/setup-node@v4"
    fi
    
    # Check for pnpm setup
    if grep -q "pnpm" "$workflow" && ! grep -q "pnpm/action-setup" "$workflow"; then
        echo "  ⚠️  Uses pnpm but missing pnpm/action-setup"
    fi
    
    # Check syntax (basic YAML check)
    if command -v yamllint &> /dev/null; then
        if ! yamllint -d relaxed "$workflow" 2>&1 | grep -q "0 warning(s)"; then
            echo "  ⚠️  YAML linting warnings found"
        fi
    fi
    
    echo "  ✅ Basic validation passed"
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo "✅ All workflows validated successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Commit workflows: git add .github/workflows/"
    echo "2. Push to GitHub: git push"
    echo "3. Check Actions tab to verify execution"
    exit 0
else
    echo "⚠️  Found $ERRORS issues in workflows"
    echo "Please review and fix before pushing"
    exit 1
fi
