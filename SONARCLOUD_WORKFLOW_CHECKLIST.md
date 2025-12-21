# SonarQube Workflow Configuration Checklist

## Issue Summary

❌ **Error**: `Failed to load the default quality profiles: No organization with key '***'`

**Root Cause**: Invalid or missing organization key in SonarCloud configuration

---

## ✅ Fixes Applied

### 1. Workflow Configuration

- [x] Updated `.github/workflows/sonarqube.yml`
- [x] Removed dynamic secret references that may not exist
- [x] Hardcoded validated SonarCloud parameters:
  - Project Key: `ZinTrust_ZinTrust`
  - Organization: `zintrust`
  - Coverage Report: `coverage/lcov.info`
- [x] Fixed PR comment script to use hardcoded project ID

### 2. Configuration Consistency

- [x] `sonar-project.properties` - Already correct
  ```properties
  sonar.projectKey=ZinTrust_ZinTrust
  sonar.organization=zintrust
  ```
- [x] `scripts/sonarcloud-issues.ts` - Already correct
  ```typescript
  const organization = process.env['SONAR_ORGANIZATION'] || 'zintrust';
  ```

### 3. Documentation

- [x] Created `md/SONARCLOUD_FIX_WORKFLOW.md` with detailed explanation

---

## 🔧 GitHub Repository Setup

Before the workflow can succeed, complete these one-time steps:

### Step 1: Create SonarCloud Organization (if needed)

- [ ] Visit https://sonarcloud.io/organizations
- [ ] Create organization or verify existing one
- [ ] Organization key should be: **`zintrust`**

### Step 2: Create SonarCloud Project (if needed)

- [ ] Visit https://sonarcloud.io/projects
- [ ] Create project or verify existing one
- [ ] Project key should be: **`ZinTrust_ZinTrust`**

### Step 3: Generate SonarCloud Token

- [ ] Visit https://sonarcloud.io/account/security
- [ ] Click "Generate" to create new token
- [ ] Copy the token (you won't be able to see it again)

### Step 4: Add GitHub Secret

- [ ] Go to repository: https://github.com/ZinTrust/ZinTrust
- [ ] Click Settings → Secrets and variables → Actions
- [ ] Click "New repository secret"
- [ ] Name: **`SONAR_TOKEN`**
- [ ] Value: **paste token from Step 3**
- [ ] Click "Add secret"

---

## ✅ Testing the Fix

### Option 1: Push Changes

```bash
git add .github/workflows/sonarqube.yml
git add md/SONARCLOUD_FIX_WORKFLOW.md
git commit -m "fix: sonarqube workflow organization configuration"
git push origin master
```

Then monitor at: https://github.com/ZinTrust/ZinTrust/actions/workflows/sonarqube.yml

### Option 2: Manual Trigger

1. Go to Actions tab in GitHub
2. Click "SonarQube Analysis" workflow
3. Click "Run workflow"
4. Select branch: `master`
5. Click "Run workflow"

### Option 3: Create Pull Request

1. Create a feature branch
2. Push code
3. Create PR to master
4. Workflow will run automatically

---

## 📊 What Gets Analyzed

Once workflow succeeds, SonarCloud will analyze:

| Category        | Files                | Metrics                             |
| --------------- | -------------------- | ----------------------------------- |
| **Source Code** | `src/**`             | Code quality, bugs, vulnerabilities |
|                 | `app/**`             | Code smells, duplicate code         |
|                 | `routes/**`          | Cyclomatic complexity               |
| **Tests**       | `tests/**`           | Coverage percentage                 |
| **Output**      | `coverage/lcov.info` | Line and branch coverage            |

---

## 🔍 Expected Results

After first successful run:

1. **Dashboard**: https://sonarcloud.io/project/overview?id=ZinTrust_ZinTrust
2. **Metrics Tracked**:
   - Code Coverage
   - Bugs
   - Vulnerabilities
   - Code Smells
   - Cognitive Complexity
   - Duplications
   - Hotspots

3. **Quality Gate**: Pass/Fail status on PRs

---

## 🚨 Troubleshooting

### Problem: Workflow still fails with organization error

**Solution**:

1. Verify organization exists in SonarCloud
2. Verify organization key is exactly `zintrust` (lowercase)
3. Verify `SONAR_TOKEN` secret is set in GitHub
4. Regenerate token and update secret if needed

### Problem: Coverage report not found

**Solution**:

1. Ensure `npm run test:coverage` runs successfully locally
2. Verify `coverage/lcov.info` file is created
3. Check file path in workflow matches output path

### Problem: Project not found

**Solution**:

1. Verify project exists in SonarCloud
2. Verify project key is exactly `ZinTrust_ZinTrust`
3. Verify token has permission to access project

### Problem: Still getting 403 Forbidden

**Solution**:

1. Regenerate SonarCloud token
2. Delete old secret
3. Create new secret with new token
4. Retry workflow

---

## 📝 Files Modified

```
.github/workflows/sonarqube.yml
  ✅ Fixed projectKey and organization parameters
  ✅ Removed dynamic secret references
  ✅ Simplified PR comment script

md/SONARCLOUD_FIX_WORKFLOW.md
  ✅ Created comprehensive fix documentation
```

---

## ✅ Validation Checklist

Before considering this issue resolved:

- [ ] SonarCloud organization exists and key is `zintrust`
- [ ] SonarCloud project exists and key is `ZinTrust_ZinTrust`
- [ ] `SONAR_TOKEN` secret is added to GitHub repository
- [ ] Workflow file has been updated with hardcoded parameters
- [ ] Pushed changes to repository
- [ ] Workflow runs without "organization" errors
- [ ] First successful SonarQube analysis completes
- [ ] Dashboard shows project overview
- [ ] PR checks include SonarQube quality gate

---

## 📚 Related Documentation

- [SonarCloud API Reference](./scripts/SONARCLOUD_API.md)
- [SonarCloud Quick Reference](./scripts/SONARCLOUD_QUICK_REF.md)
- [SonarQube Setup](./scripts/sonarqube-setup.js)
- [SonarQube Status](./SONARQUBE_STATUS.txt)
- [SonarQube Fixes](./md/SONARQUBE_FIXES.md)

---

## 🎯 Next Steps

1. **Complete GitHub Setup** (Steps 1-4 above)
2. **Push Changes** to repository
3. **Monitor First Run** of workflow
4. **Review Results** on SonarCloud dashboard
5. **Configure Quality Gates** if needed

---

**Status**: ✅ Workflow fixed and ready for configuration

**Last Updated**: December 20, 2025
