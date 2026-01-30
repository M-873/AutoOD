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
    pkgs.python311Packages.pandas
    pkgs.python311Packages.matplotlib
    pkgs.python311Packages.scipy
    pkgs.python311Packages.seaborn
    pkgs.python311Packages.requests
    pkgs.python311Packages.tqdm
    pkgs.python311Packages.pyyaml
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
