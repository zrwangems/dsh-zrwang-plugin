# Troubleshooting

If any step fails, work through this checklist in order:

| Symptom | Check | Fix |
|---------|-------|-----|
| `findsdru` returns empty | Host NIC not on correct subnet | Set static IP on same subnet as USRP |
| `findsdru` returns empty | NIC interface is down | `sudo ip link set <iface> up` |
| `findsdru` returns empty | Firewall blocking UHD discovery | Allow UDP traffic on USRP subnet |
| `findsdru` shows `USRPDriverNotCompatible` | UHD version mismatch | Run `radioSetupWizard` → **Update Image**; if wizard fails, use manual Mender update (see below) |
| `probesdru` shows `MPM major compat number mismatch` (UHD Module Peripheral Manager, not MATLAB Package Manager) | Device firmware older/newer than host UHD | Same fix — `radioSetupWizard` → Update Image, or manual Mender. `findsdru` may still show Success |
| Streaming drops samples | MTU wrong for link speed | 10 GbE: set MTU 9000. 1 GbE Windows: set MTU 1498. 1 GbE Linux: leave at 1500 |
| Streaming drops samples | Kernel buffers too small | Increase `rmem_max`/`wmem_max` to 33554432 |
| Streaming drops samples | USB dongle | Replace with PCIe NIC |
| Streaming drops samples | 1 GbE NIC with high sample rate | Reduce sample rate or upgrade to 10 GbE (E320 1G variant: max ~25 Msps complex) |
| Streaming drops samples | Laptop on battery | Connect to power supply |
| `OpTimeout` / `RFnocError` | Data transfer rate too low | See [Resolve Issues with Data Transfer Rate](https://www.mathworks.com/help/wireless-testbench/ug/resolve-issues-with-data-transfer-rate.html) |
| `basebandTransceiver` errors | No saved radio config | Create config (Step 4) |
| `basebandTransceiver` errors | Another process claims device | Close other MATLAB sessions or UHD applications; if same session, run `clear bbtrx` (or variable name) to release the lease |
| `findsdru` returns empty | IP assigned to enslaved NIC, not bridge | Move static IP to the bridge interface (`br0`, Hyper-V vSwitch) |
| `findsdru` returns empty | STP convergence delay on switch/bridge | Wait 30–50s after link-up, or disable STP on the USRP port |
| `findsdru` returns empty but `findsdru(ip)` works | Broadcast filtered by managed switch | Configure switch to forward broadcast on the USRP VLAN/port |
| Streaming drops samples but host MTU is 9000 | Switch in path doesn't support jumbo frames | Check switch MTU settings or connect USRP directly to host NIC |

## UHD Version Mismatch — Manual Mender Update (N3xx, X410, E320 with UHD >= 4.0)

If `radioSetupWizard` cannot update the radio firmware automatically:

1. Disable the OS firewall on the connected interface
2. Get the `.mender` image URL from the device parameters and provide it to the user:

```matlab
params = wt.internal.hardware.DefaultDevices.getUsrpE320Params();  % ← match device
fprintf("Download the Mender image from:\n  %s\n", params.ImageInfo.Mender.DOWNLOAD_URL)
```

3. Once downloaded and extracted (the `.mender` file is typically named `usrp_<device>_fs.mender`), copy and install:

```bash
scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no <image>.mender root@192.168.10.2:/tmp/wt-uhd-image.mender
ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no root@192.168.10.2
mender install /tmp/wt-uhd-image.mender
reboot
# After reboot, verify radio works, then commit:
mender commit
```

**Warning:** Do not close MATLAB during a firmware update — an incomplete file on the radio filesystem will block subsequent attempts (reboot the device to recover).

See [Resolve Issues with Radio Setup Validation](https://www.mathworks.com/help/wireless-testbench/ug/resolve-issues-with-radio-setup-validation.html) for full details.

## Network Path Diagnostics

If `findsdru` returns empty but you believe the radio is connected, use this sequence to isolate the problem:

```matlab
% 1. Try direct unicast probe (bypasses broadcast discovery)
status = findsdru('192.168.10.2');  % Use known/expected IP
fprintf("Direct probe: %s\n", status.Status)

% 2. If direct probe works but findsdru alone doesn't → broadcast is blocked
%    Check: managed switch VLAN config, IGMP snooping, or bridge not forwarding
```

## Bridge/NIC Teaming Interference

If the radio NIC is enslaved to a bridge or vSwitch, re-run the bridge detection checks from Step 1 (see [bridge-detection.md](bridge-detection.md)). The static IP and MTU must be on the bridge interface, not the physical NIC.

## `probesdru` for Runtime Diagnosis

`probesdru` is not just for initial setup — use it anytime things go wrong after the radio is running. It reports UHD version, FPGA image, daughterboard info, and buffer warnings that reveal the root cause of streaming issues.

```matlab
% Run anytime to diagnose issues — even after setup is complete
info = probesdru(selectedRadio.IPAddress)
```

Look for: UHD buffer size warnings, FPGA image mismatches, claim errors (another process using the device), and daughterboard detection failures.

## Diagnostic Order

Host inspection (Step 1) → `findsdru` → `probesdru` → NIC fixes → radio config. Do NOT skip to `basebandTransceiver` without confirming the host and radio are both ready.

Copyright 2026 The MathWorks, Inc.
