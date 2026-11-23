"""Produce a separate, guarded QEMU translator comparison build."""
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text()
anchor = "    git checkout ${QEMU_REPO_VERSION}\n"
if source.count(anchor) != 1:
    raise SystemExit("The pinned QEMU checkout stage differs.")
patch = r'''RUN test "$(grep -c '^#define INSTANTIATE_NUM 1500$' /qemu/tcg/wasm32.h)" = 1 && \
    test "$(grep -c '^#define MAX_INSTANCE_ALIVE 15000$' /qemu/tcg/wasm32.c)" = 1 && \
    sed -i 's/^#define INSTANTIATE_NUM 1500$/#define INSTANTIATE_NUM 100/' /qemu/tcg/wasm32.h && \
    sed -i 's/^#define MAX_INSTANCE_ALIVE 15000$/#define MAX_INSTANCE_ALIVE 60000/' /qemu/tcg/wasm32.c
'''
pathlib.Path(sys.argv[2]).write_text(source.replace(anchor, anchor + patch))
