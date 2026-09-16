@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   Building OMI Manager EXE...
echo ========================================
echo.
dotnet build "tools\OMIManager\OMIManager.csproj" -c Release
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Build FAILED!
    pause
    exit /b 1
)
echo.
echo Copying files to project root...
xcopy /Y "tools\OMIManager\bin\Release\net10.0-windows\OMIManager.*" ".\"
echo.
echo ========================================
echo   Build complete!
echo   EXE: OMIManager.exe
echo ========================================
pause