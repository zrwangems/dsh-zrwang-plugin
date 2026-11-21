@echo off
if not defined ZRWANG_GIT_BASH (
  echo bash is not configured in DSH plugin settings 1>&2
  exit /b 127
)
"%ZRWANG_GIT_BASH%" %*
