"""Builds one floor: model.py -- <out dir> --floor <name>  (see lib.py)."""
import importlib, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import lib

bpy.ops.wm.read_factory_settings(use_empty=True)
floor = importlib.import_module(f"floor_{lib.FLOOR}")
floor.build()
ctx = lib.finish_meshes(lib.FLOOR)
floor.write(ctx)
print(f"[{lib.FLOOR}] done", flush=True)
