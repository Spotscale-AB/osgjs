import Input from 'tests/osgDB/Input';
import ReaderParser from 'tests/osgDB/ReaderParser';
import DatabasePager from 'tests/osgDB/DatabasePager';
import KTX2Reader from 'tests/osgDB/KTX2Reader';
import ktx2Worker from 'tests/osgDB/ktx2Worker';

export default function() {
    Input();
    ReaderParser();
    DatabasePager();
    KTX2Reader();
    ktx2Worker();
}
