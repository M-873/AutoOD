{ pkgs }: {
  deps = [
    pkgs.python311
    pkgs.nodejs-20_x
    pkgs.libuuid
    pkgs.libGL
    pkgs.glib
    pkgs.zlib
  ];
  env = {
    PYTHON_LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
      pkgs.libuuid
      pkgs.libGL
      pkgs.glib
      pkgs.zlib
    ];
  };
}
