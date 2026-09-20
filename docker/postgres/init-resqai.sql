-- Keep the application database free of the optional extensions preloaded by the
-- PostGIS image. The ResQai migration installs only the extension it requires.
CREATE DATABASE resqai WITH OWNER resqai TEMPLATE template0 ENCODING 'UTF8';
