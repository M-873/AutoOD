{ pkgs }: {
  deps = [
    pkgs.python311
    pkgs.python311Packages.pip
    pkgs.python311Packages.torch
    pkgs.python311Packages.torchvision
    pkgs.python311Packages.transformers
    pkgs.python311Packages.numpy
    pkgs.python311Packages.pillow
    pkgs.python311Packages.opencv4
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
