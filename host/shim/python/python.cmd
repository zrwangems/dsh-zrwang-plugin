@echo off
if not defined ZRWANG_SKILL_PYTHON (
  echo python is not configured in DSH plugin settings 1>&2
  exit /b 127
)
"%ZRWANG_SKILL_PYTHON%" %*
